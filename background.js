import './tts.js';
import authHandler from './auth.js';
import licenseHandler from './license.js';

const PAYMENT_ORIGIN = 'https://gds-g.github.io';
const PAYMENT_PATH = '/Poe-Voice-Sync/payment/payment.html';

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

async function notifyPoeTabs() {
    const tabs = await chrome.tabs.query({ url: '*://*.poe.com/*' });
    await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: 'LICENSE_UPDATED' })));
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
    const settings = await chrome.storage.sync.get(['ttsProvider', 'apiKey', 'voice']);
    const blob = await globalThis.PoeVoiceTTS.synthesize({
        provider: settings.ttsProvider,
        apiKey: settings.apiKey,
        voiceId: settings.voice,
        text
    });
    return {
        success: true,
        audioBase64: arrayBufferToBase64(await blob.arrayBuffer()),
        mimeType: blob.type || 'audio/mpeg'
    };
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
    if (request.type === 'GET_LICENSE_STATE') {
        getLicenseState().then(sendResponse).catch(error => sendResponse({ success: false, isValid: false, error: error.message }));
        return true;
    }
    if (request.type === 'SYNTHESIZE_SPEECH') {
        synthesizeSpeech(request.text).then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
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
