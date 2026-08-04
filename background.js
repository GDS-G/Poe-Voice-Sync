import './tts.js';
import authHandler from './auth.js';
import licenseHandler from './license.js';

const PAYMENT_ORIGIN = 'https://gds-g.github.io';
const PAYMENT_PATH = '/Poe-Voice-Sync/payment/payment.html';
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
let creatingOffscreenDocument = null;

function isExpectedPaymentSender(sender) {
    try {
        const url = new URL(sender.url || '');
        return url.origin === PAYMENT_ORIGIN && url.pathname === PAYMENT_PATH;
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
    const result = await licenseHandler.verifyLicenseForEmail(authState.userEmail);
    return { ...result, userEmail: authState.userEmail };
}

async function synthesizeSpeech(text) {
    const license = await getLicenseState();
    if (!license.isValid) throw new Error('An active Poe Voice Sync license is required.');
    const [settings, localSecrets] = await Promise.all([
        chrome.storage.sync.get(['ttsProvider', 'voice']),
        chrome.storage.local.get(['apiKey'])
    ]);
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

async function stopSpeech() {
    if (!await hasOffscreenDocument()) return { success: true };
    const result = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'OFFSCREEN_STOP_AUDIO' });
    return result?.success === false ? result : { success: true };
}

async function recordPaymentReceipt(orderId, transactionId) {
    if (!isPayPalIdentifier(orderId) || !isPayPalIdentifier(transactionId)) {
        throw new Error('Invalid PayPal transaction identifiers.');
    }
    const authState = await authHandler.getAuthState();
    if (!authState.isAuthenticated || !authState.userEmail) throw new Error('Sign in before recording a payment receipt.');
    const paymentReceipt = {
        orderId,
        transactionId,
        licensedEmail: authState.userEmail,
        receivedAt: Date.now(),
        status: 'pending-manual-verification'
    };
    await chrome.storage.local.set({ paymentReceipt });
    return { success: true, activation: 'signed-license-required' };
}

async function recordSubscriptionReceipt(subscriptionId, planId, billingPeriod) {
    if (!isPayPalIdentifier(subscriptionId) || !isPayPalIdentifier(planId)) {
        throw new Error('Invalid PayPal subscription identifiers.');
    }
    if (!['monthly', 'yearly'].includes(billingPeriod)) throw new Error('Invalid subscription billing period.');
    const authState = await authHandler.getAuthState();
    if (!authState.isAuthenticated || !authState.userEmail) throw new Error('Sign in before recording a subscription receipt.');
    const paymentReceipt = {
        subscriptionId,
        planId,
        billingPeriod,
        licensedEmail: authState.userEmail,
        receivedAt: Date.now(),
        status: 'pending-manual-verification'
    };
    await chrome.storage.local.set({ paymentReceipt });
    return { success: true, activation: 'signed-license-required' };
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.target === 'offscreen') return false;
    if (request.type === 'GET_LICENSE_STATE') {
        getLicenseState().then(sendResponse).catch(error => sendResponse({ success: false, isValid: false, error: error.message }));
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

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    if (request.type !== 'PAYMENT_COMPLETE' && request.type !== 'PAYPAL_SUBSCRIPTION_APPROVED') return false;
    if (!isExpectedPaymentSender(sender)) {
        sendResponse({ status: 'error', message: 'Untrusted payment page.' });
        return false;
    }
    const operation = request.type === 'PAYPAL_SUBSCRIPTION_APPROVED'
        ? recordSubscriptionReceipt(request.subscriptionId, request.planId, request.billingPeriod)
        : recordPaymentReceipt(request.orderId, request.transactionId);
    operation
        .then(result => sendResponse({ status: 'pending-verification', ...result }))
        .catch(error => sendResponse({ status: 'error', message: error.message }));
    return true;
});
