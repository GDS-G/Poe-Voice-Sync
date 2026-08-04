(function initializePaymentPage() {
    'use strict';
    const config = window.POE_VOICE_SYNC_PAYMENT_CONFIG;
    const resultElement = document.getElementById('result-message');

    function showResult(message, isError = false) {
        resultElement.textContent = message;
        resultElement.className = isError ? 'error' : 'success';
    }

    function validPlanId(planId) {
        return /^P-[A-Z0-9]{8,64}$/i.test(planId || '');
    }

    async function recordSubscription(subscriptionId, planId, billingPeriod) {
        if (!window.extId) return false;
        try {
            const response = await chrome.runtime.sendMessage(window.extId, {
                type: 'PAYPAL_SUBSCRIPTION_APPROVED',
                subscriptionId,
                planId,
                billingPeriod
            });
            return response?.status !== 'error';
        } catch (error) {
            console.error('Could not record the subscription receipt:', error);
            return false;
        }
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
                return actions.subscription.create({ plan_id: plan.planId });
            },
            async onApprove(data) {
                const subscriptionId = data.subscriptionID;
                const recorded = await recordSubscription(subscriptionId, plan.planId, period);
                showResult(
                    `Subscription approved.\nReference: ${subscriptionId}\n` +
                    (recorded
                        ? 'Your receipt is pending manual verification. Send this reference and your Poe Voice Sync email to admin@ascensionrealmstudios.com to receive your signed license.'
                        : 'The extension could not record the receipt. Send this reference and your Poe Voice Sync email to admin@ascensionrealmstudios.com.'),
                    !recorded
                );
            },
            onError(error) {
                console.error('PayPal subscription error:', error);
                showResult(`PayPal subscription error:\n${error.message || error}`, true);
            }
        }).render(`#${containerId}`).catch(error => showResult(`Could not render PayPal checkout:\n${error.message || error}`, true));
    }

    if (!config?.clientId || !config?.plans) {
        showResult('Payment configuration is incomplete.', true);
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
