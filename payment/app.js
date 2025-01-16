// app.js
function resultMessage(message) {
    const messageElement = document.getElementById('result-message');
    messageElement.innerHTML = message;
}

window.paypal
    .Buttons({
        style: {
            shape: "rect",
            layout: "vertical",
            color: "gold",
            label: "paypal",
        },

        createOrder: function(data, actions) {
            return actions.order.create({
                purchase_units: [{
                    description: "POE Voice Sync License",
                    amount: {
                        currency_code: "USD",
                        value: "19.99"
                    }
                }]
            });
        },

        onApprove: async function(data, actions) {
            try {
                const orderData = await actions.order.capture();
                const transaction = orderData?.purchase_units?.[0]?.payments?.captures?.[0];

                if (transaction?.status === "COMPLETED") {
                    // Show success message first
                    resultMessage(`
                        Payment successful!<br>
                        Transaction ID: ${transaction.id}<br>
                        Processing license activation...
                    `);

                    // Get extension ID from URL
                    const urlParams = new URLSearchParams(window.location.search);
                    const extId = urlParams.get('extId');

                    if (!extId) {
                        throw new Error('Extension ID not found');
                    }

                    // Send message directly to the extension using Chrome runtime
                    chrome.runtime.sendMessage(extId, {
                        type: 'PAYMENT_COMPLETE',
                        orderId: orderData.id,
                        transactionId: transaction.id
                    }, response => {
                        console.log('Message response:', response);
                        if (chrome.runtime.lastError) {
                            console.error('Error sending message:', chrome.runtime.lastError);
                            resultMessage(`
                                Error activating license.<br>
                                Please close this window and restart the extension.
                            `);
                            return;
                        }

                        // Close window after successful message
                        setTimeout(() => {
                            window.close();
                        }, 3000);
                    });

                } else if (transaction?.status === "INSTRUMENT_DECLINED") {
                    return actions.restart();
                } else {
                    throw new Error(`Transaction status: ${transaction?.status}`);
                }
            } catch (error) {
                console.error('Payment error:', error);
                resultMessage(`
                    Transaction failed:<br>
                    ${error.message || error}
                `);
            }
        },

        onError: function(err) {
            console.error('PayPal error:', err);
            resultMessage(`
                Payment Error:<br>
                ${err.message || err}
            `);
        }
    })
    .render("#paypal-button-container");
