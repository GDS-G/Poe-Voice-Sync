// app.js
function resultMessage(message, isError = false) {
    const messageElement = document.getElementById('result-message');
    messageElement.innerHTML = message;
    messageElement.className = isError ? 'error' : 'success';
}

window.paypal
    .Buttons({
        style: {
            shape: "rect",
            layout: "vertical",
            color: "gold",
            label: "paypal",
        },

        async createOrder() {
            try {
                // Create order directly without server
                const order = await paypal.createOrder({
                    intent: "CAPTURE",
                    purchase_units: [{
                        amount: {
                            currency_code: "USD",
                            value: "19.99"
                        },
                        description: "POE Voice Sync License"
                    }]
                });

                return order.id;
            } catch (error) {
                console.error(error);
                resultMessage(`Could not initiate PayPal Checkout...<br><br>${error}`, true);
            }
        },

        async onApprove(data, actions) {
            try {
                const orderData = await actions.order.capture();

                // Handle different transaction states
                const transaction =
                    orderData?.purchase_units?.[0]?.payments?.captures?.[0] ||
                    orderData?.purchase_units?.[0]?.payments?.authorizations?.[0];

                if (transaction?.status === "COMPLETED") {
                    // Activate license
                    try {
                        await chrome.runtime.sendMessage({
                            type: 'PAYMENT_COMPLETE',
                            orderId: orderData.id
                        });

                        resultMessage(`
                            Payment successful!<br>
                            Transaction ID: ${transaction.id}<br>
                            Activating your license...
                        `);

                        // Close window after successful activation
                        setTimeout(() => {
                            window.close();
                        }, 3000);

                    } catch (licenseError) {
                        console.error('License activation error:', licenseError);
                        resultMessage(`
                            Payment successful, but license activation failed.<br>
                            Please contact support with Transaction ID: ${transaction.id}
                        `, true);
                    }
                } else if (transaction?.status === "INSTRUMENT_DECLINED") {
                    return actions.restart();
                } else {
                    throw new Error(`Unexpected transaction status: ${transaction?.status}`);
                }

                // Log full order data for debugging
                console.log("Order data:", JSON.stringify(orderData, null, 2));

            } catch (error) {
                console.error(error);
                resultMessage(`
                    Sorry, your transaction could not be processed...<br><br>
                    ${error.message || error}
                `, true);
            }
        },

        onError(error) {
            console.error('PayPal error:', error);
            resultMessage(`
                PayPal checkout error:<br><br>
                ${error.message || error}
            `, true);
        }
    })
    .render("#paypal-button-container");

// Handle messages from background script
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'LICENSE_ACTIVATED') {
        resultMessage('License activated successfully! You can now close this window.');
    }
});