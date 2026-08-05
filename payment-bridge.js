(function bridgePayPalApproval() {
    'use strict';
    const PAYMENT_ORIGIN = 'https://gds-g.github.io';
    const APPROVAL_CHANNEL = 'PVS_PAYMENT_APPROVAL';
    const RESULT_CHANNEL = 'PVS_PAYMENT_RESULT';

    window.addEventListener('message', async event => {
        if (event.source !== window || event.origin !== PAYMENT_ORIGIN) return;
        const payload = event.data;
        if (!payload || payload.channel !== APPROVAL_CHANNEL || typeof payload.requestId !== 'string') return;
        let response;
        try {
            response = await chrome.runtime.sendMessage({
                type: 'PAYPAL_SUBSCRIPTION_APPROVED',
                subscriptionId: payload.subscriptionId,
                planId: payload.planId,
                billingPeriod: payload.billingPeriod,
                checkout: payload.checkout,
                licenseHash: payload.licenseHash
            });
        } catch (error) {
            response = { status: 'error', message: error.message };
        }
        window.postMessage({ channel: RESULT_CHANNEL, requestId: payload.requestId, response }, PAYMENT_ORIGIN);
    });
})();
