import './tts.js';
import authHandler from './auth.js';
import licenseHandler from './license.js';
import { hashLicensedEmail } from './license-token.js';
import { SUBSCRIPTION_CONFIG } from './subscription-config.js';

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
let creatingOffscreenDocument = null;
let backgroundAudio = null;
let backgroundAudioUrl = null;

function isExpectedPaymentSender(sender) {
    try {
        const url = new URL(sender.url || '');
        return url.origin === SUBSCRIPTION_CONFIG.paymentOrigin && url.pathname === SUBSCRIPTION_CONFIG.paymentPath;
    } catch (_) { return false; }
}

function isPayPalIdentifier(value) {
    return typeof value === 'string' && /^[a-z0-9-]{8,64}$/i.test(value);
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
}

async function notifyPoeTabs(message = { type: 'LICENSE_UPDATED' }) {
    const tabs = await chrome.tabs.query({ url: '*://*.poe.com/*' });
    await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, message)));
}

async function hasOffscreenDocument() {
    if (chrome.offscreen?.hasDocument) return chrome.offscreen.hasDocument();
    if (chrome.runtime.getContexts) {
        const contexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
        });
        return contexts.length > 0;
    }
    return false;
}

async function ensureOffscreenDocument() {
    if (!chrome.offscreen?.createDocument) {
        throw new Error('This browser does not support extension-initiated automatic audio playback.');
    }
    if (await hasOffscreenDocument()) return;
    if (!creatingOffscreenDocument) {
        creatingOffscreenDocument = chrome.offscreen.createDocument({
            url: OFFSCREEN_DOCUMENT_PATH,
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Automatically read newly received Poe chatbot responses aloud.'
        }).catch(error => {
            if (!/single offscreen document/i.test(error?.message || '')) throw error;
        }).finally(() => {
            creatingOffscreenDocument = null;
        });
    }
    await creatingOffscreenDocument;
}

async function getLicenseState() {
    const authState = await authHandler.getAuthState();
    if (!authState.isAuthenticated || !authState.userEmail) {
        return { success: true, isValid: false, reason: 'not_authenticated' };
    }
    await licenseHandler.refreshAutomaticLicense(authState.userEmail);
    const result = await licenseHandler.verifyLicenseForEmail(authState.userEmail);
    return { ...result, userEmail: authState.userEmail };
}

async function synthesizeSpeech(text) {
    const license = await getLicenseState();
    if (!license.isValid) throw new Error('An active Poe Voice Sync license is required.');
    const [settings, localSecrets] = await Promise.all([
        chrome.storage.sync.get(['ttsProvider', 'voice', 'providerConsent']),
        chrome.storage.local.get(['apiKey'])
    ]);
    if (settings.providerConsent !== true) {
        throw new Error('Voice provider consent is required before generating speech.');
    }
    const blob = await globalThis.PoeVoiceTTS.synthesize({
        provider: settings.ttsProvider,
        apiKey: localSecrets.apiKey,
        voiceId: settings.voice,
        text
    });
    return {
        success: true,
        audioBase64: arrayBufferToBase64(await blob.arrayBuffer()),
        mimeType: blob.type || 'audio/mpeg'
    };
}

async function playSpeech(text) {
    const speech = await synthesizeSpeech(text);
    const { volume = 0.7 } = await chrome.storage.sync.get(['volume']);
    if (chrome.offscreen?.createDocument) {
        await ensureOffscreenDocument();
        const result = await chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'OFFSCREEN_PLAY_AUDIO',
            ...speech,
            volume: Number(volume)
        });
        if (!result?.success) throw new Error(result?.error || 'Automatic audio playback failed.');
        return { success: true };
    }
    if (typeof Audio !== 'function') {
        throw new Error('This browser does not support extension-initiated automatic audio playback.');
    }
    await stopBackgroundAudio();
    const bytes = Uint8Array.from(atob(speech.audioBase64), character => character.charCodeAt(0));
    backgroundAudioUrl = URL.createObjectURL(new Blob([bytes], { type: speech.mimeType }));
    backgroundAudio = new Audio(backgroundAudioUrl);
    backgroundAudio.volume = Math.min(1, Math.max(0, Number(volume)));
    const cleanup = async error => {
        if (backgroundAudioUrl) URL.revokeObjectURL(backgroundAudioUrl);
        backgroundAudio = null;
        backgroundAudioUrl = null;
        await notifyPoeTabs({ type: 'OFFSCREEN_PLAYBACK_FINISHED', error: error || '' });
    };
    backgroundAudio.addEventListener('ended', () => cleanup(''), { once: true });
    backgroundAudio.addEventListener('error', () => cleanup('Automatic audio playback failed.'), { once: true });
    await backgroundAudio.play();
    return { success: true };
}

async function stopBackgroundAudio() {
    if (!backgroundAudio) return;
    backgroundAudio.pause();
    backgroundAudio.currentTime = 0;
    if (backgroundAudioUrl) URL.revokeObjectURL(backgroundAudioUrl);
    backgroundAudio = null;
    backgroundAudioUrl = null;
}

async function stopSpeech() {
    if (backgroundAudio) {
        await stopBackgroundAudio();
        return { success: true };
    }
    if (!await hasOffscreenDocument()) return { success: true };
    const result = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'OFFSCREEN_STOP_AUDIO' });
    return result?.success === false ? result : { success: true };
}

function randomCheckoutNonce() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function beginPayPalCheckout() {
    const authState = await authHandler.getAuthState();
    if (!authState.isAuthenticated || !authState.userEmail) throw new Error('Sign in before purchasing a subscription.');
    const nonce = randomCheckoutNonce();
    const licenseHash = await hashLicensedEmail(authState.userEmail);
    const pendingCheckout = {
        nonce,
        licenseHash,
        licensedEmail: authState.userEmail,
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000
    };
    await chrome.storage.local.set({ pendingCheckout });
    const url = new URL(SUBSCRIPTION_CONFIG.paymentUrl);
    url.searchParams.set('checkout', nonce);
    url.searchParams.set('license', licenseHash);
    return { success: true, url: url.toString() };
}

async function approveSubscription(subscriptionId, planId, billingPeriod, checkoutNonce, licenseHash) {
    if (!/^I-[A-Z0-9]{8,32}$/i.test(subscriptionId || '') || !isPayPalIdentifier(planId)) {
        throw new Error('Invalid PayPal subscription identifiers.');
    }
    if (!Object.hasOwn(SUBSCRIPTION_CONFIG.plans, billingPeriod)
        || SUBSCRIPTION_CONFIG.plans[billingPeriod] !== planId) {
        throw new Error('Invalid subscription billing plan.');
    }
    const authState = await authHandler.getAuthState();
    if (!authState.isAuthenticated || !authState.userEmail) throw new Error('Sign in before activating a subscription.');
    const { pendingCheckout } = await chrome.storage.local.get(['pendingCheckout']);
    if (!pendingCheckout
        || pendingCheckout.expiresAt <= Date.now()
        || pendingCheckout.nonce !== checkoutNonce
        || pendingCheckout.licenseHash !== licenseHash
        || pendingCheckout.licensedEmail !== authState.userEmail) {
        throw new Error('This checkout session is invalid or has expired. Start checkout again from the extension.');
    }
    await chrome.storage.local.remove(['pendingCheckout']);
    const paymentReceipt = {
        subscriptionId,
        planId,
        billingPeriod,
        licensedEmail: authState.userEmail,
        receivedAt: Date.now(),
        status: 'awaiting-signed-registry'
    };
    await chrome.storage.local.set({ paymentReceipt });
    await licenseHandler.refreshAutomaticLicense(authState.userEmail, { force: true });
    return { success: true, activation: 'automatic-pending' };
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.target === 'offscreen') return false;
    if (request.type === 'GET_LICENSE_STATE') {
        getLicenseState().then(sendResponse).catch(error => sendResponse({ success: false, isValid: false, error: error.message }));
        return true;
    }
    if (request.type === 'BEGIN_PAYPAL_CHECKOUT') {
        beginPayPalCheckout().then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    if (request.type === 'PAYPAL_SUBSCRIPTION_APPROVED') {
        if (!isExpectedPaymentSender(_sender)) {
            sendResponse({ status: 'error', message: 'Untrusted payment page.' });
            return false;
        }
        approveSubscription(
            request.subscriptionId,
            request.planId,
            request.billingPeriod,
            request.checkout,
            request.licenseHash
        )
            .then(result => sendResponse({ status: 'accepted', ...result }))
            .catch(error => sendResponse({ status: 'error', message: error.message }));
        return true;
    }
    if (request.type === 'SYNTHESIZE_SPEECH') {
        synthesizeSpeech(request.text).then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    if (request.type === 'PLAY_SPEECH') {
        playSpeech(request.text).then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    if (request.type === 'STOP_SPEECH') {
        stopSpeech().then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    if (request.type === 'OFFSCREEN_PLAYBACK_FINISHED') {
        notifyPoeTabs({ type: 'OFFSCREEN_PLAYBACK_FINISHED', error: request.error || '' })
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    if (request.type === 'LICENSE_UPDATED') {
        notifyPoeTabs().then(() => sendResponse({ success: true })).catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    return false;
});
