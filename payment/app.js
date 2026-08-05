(function initializePaymentPage() {
    'use strict';
    const config = window.POE_VOICE_SYNC_PAYMENT_CONFIG;
    const resultElement = document.getElementById('result-message');
    const parameters = new URLSearchParams(location.search);
    const checkout = parameters.get('checkout') || '';
    const licenseHash = parameters.get('license') || '';

    function showResult(message, isError = false) {
        resultElement.textContent = message;
        resultElement.className = isError ? 'error' : 'success';
    }

    function validPlanId(planId) {
        return /^P-[A-Z0-9]{8,64}$/i.test(planId || '');
    }

    async function recordSubscription(subscriptionId, planId, billingPeriod) {
        const requestId = `${checkout}-${Date.now()}`;
        return new Promise(resolve => {
            const timeout = setTimeout(() => {
                window.removeEventListener('message', receiveResult);
                resolve(false);
            }, 10000);
            function receiveResult(event) {
                if (event.source !== window || event.origin !== location.origin
                    || event.data?.channel !== 'PVS_PAYMENT_RESULT'
                    || event.data?.requestId !== requestId) return;
                clearTimeout(timeout);
                window.removeEventListener('message', receiveResult);
                resolve(event.data.response?.status === 'accepted');
            }
            window.addEventListener('message', receiveResult);
            window.postMessage({
                channel: 'PVS_PAYMENT_APPROVAL',
                requestId,
                subscriptionId,
                planId,
                billingPeriod,
                checkout,
                licenseHash
            }, location.origin);
        });
    }

    function renderButton(period, containerId) {
        const plan = config.plans[period];
        if (!validPlanId(plan.planId)) {
            document.getElementById(containerId).textContent = `${plan.name} checkout is awaiting its PayPal plan ID.`;
            return;
        }
        window.paypal.Buttons({
            style: { shape: 'rect', layout: 'vertical', color: 'gold', label: 'subscribe' },
            createSubscription(_data, actions) {
                return actions.subscription.create({
                    plan_id: plan.planId,
                    custom_id: `pvs2-${licenseHash}`,
                    application_context: { shipping_preference: 'NO_SHIPPING' }
                });
            },
            async onApprove(data) {
                const subscriptionId = data.subscriptionID;
                const recorded = await recordSubscription(subscriptionId, plan.planId, period);
                showResult(
                    `Subscription approved.\nReference: ${subscriptionId}\n` +
                    (recorded
                        ? 'Secure activation is automatic and normally completes within about 10 minutes. Return to the extension and reopen it shortly.'
                        : 'The extension could not activate this checkout. Return to the extension and choose Purchase with PayPal again. Keep this reference if you contact support.'),
                    !recorded
                );
            },
            onError(error) {
                console.error('PayPal subscription error:', error);
                showResult(`PayPal subscription error:\n${error.message || error}`, true);
            }
        }).render(`#${containerId}`).catch(error => showResult(`Could not render PayPal checkout:\n${error.message || error}`, true));
    }

    if (!config?.clientId || !config?.plans
        || !/^[A-Za-z0-9_-]{20,64}$/.test(checkout)
        || !/^[a-f0-9]{64}$/.test(licenseHash)) {
        showResult('This checkout link is invalid or expired. Start purchasing from the Poe Voice Sync extension.', true);
        return;
    }
    const sdk = document.createElement('script');
    const query = new URLSearchParams({
        'client-id': config.clientId,
        currency: config.currency || 'USD',
        components: 'buttons',
        vault: 'true',
        intent: 'subscription'
    });
    sdk.src = `https://www.paypal.com/sdk/js?${query}`;
    sdk.onload = () => {
        renderButton('monthly', 'paypal-monthly');
        renderButton('yearly', 'paypal-yearly');
    };
    sdk.onerror = () => showResult('PayPal checkout failed to load. Refresh and try again.', true);
    document.head.appendChild(sdk);
})();
