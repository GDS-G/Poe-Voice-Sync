// app.js
(function() {
    function resultMessage(message, isError = false) {
        const messageElement = document.getElementById('result-message');
        messageElement.innerHTML = message;
        messageElement.className = isError ? 'error' : 'success';
    }

    // Function to handle payment notification
    async function notifyPaymentComplete(paymentData) {
        // Try direct extension messaging first
        if (window.extId) {
            try {
                await chrome.runtime.sendMessage(window.extId, {
                    type: 'PAYMENT_COMPLETE',
                    ...paymentData
                });
                return true;
            } catch (error) {
                console.log('Direct extension message failed:', error);
            }
        }

        // Fallback to opener messaging
        if (window.opener && !window.opener.closed) {
            window.opener.postMessage({
                type: 'PAYMENT_COMPLETE',
                ...paymentData
            }, '*');
            return true;
        }

        return false;
    }

    // Initialize PayPal buttons
    if (window.paypal) {
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
                            resultMessage(`
                                Payment successful!<br>
                                Processing license activation...
                            `);

                            const paymentData = {
                                orderId: orderData.id,
                                transactionId: transaction.id
                            };

                            // Attempt to notify about payment
                            const notified = await notifyPaymentComplete(paymentData);

                            if (notified) {
                                resultMessage(`
                                    Payment successful!<br>
                                    Please close this window and click the extension icon to complete activation.
                                `);

                                // Wait a moment before closing
                                setTimeout(() => {
                                    window.close();
                                }, 3000);
                            } else {
                                resultMessage(`
                                    Payment successful but couldn't notify extension.<br>
                                    Please close this window and click the extension icon.
                                `, true);
                            }
                        } else if (transaction?.status === "INSTRUMENT_DECLINED") {
                            return actions.restart();
                        } else {
                            throw new Error(`Unexpected transaction status: ${transaction?.status}`);
                        }
                    } catch (error) {
                        console.error('Payment error:', error);
                        resultMessage(`
                            Transaction failed:<br>
                            ${error.message || error}
                        `, true);
                    }
                },

                onError: function(err) {
                    console.error('PayPal error:', err);
                    resultMessage(`
                        Payment Error:<br>
                        ${err.message || err}
                    `, true);
                }
            })
            .render("#paypal-button-container")
            .catch(function(error) {
                console.error('Button render error:', error);
                resultMessage('Failed to load payment buttons. Please refresh the page.', true);
            });
    } else {
        resultMessage('Failed to load PayPal SDK. Please refresh the page.', true);
    }
})();
