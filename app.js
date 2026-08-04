// app.js
(function() {
    function resultMessage(message, isError = false) {
        const messageElement = document.getElementById('result-message');
        messageElement.textContent = message;
        messageElement.className = isError ? 'error' : 'success';
    }

    async function recordPaymentReceipt(paymentData) {
        if (window.extId) {
            try {
                const response = await chrome.runtime.sendMessage(window.extId, {
                    type: 'PAYMENT_COMPLETE',
                    ...paymentData
                });
                return response?.status !== 'error';
            } catch (error) {
                console.log('Direct extension message failed:', error);
            }
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
                            resultMessage('Payment successful. Recording the receipt for license verification...');

                            const paymentData = {
                                orderId: orderData.id,
                                transactionId: transaction.id
                            };

                            const receiptRecorded = await recordPaymentReceipt(paymentData);

                            if (receiptRecorded) {
                                resultMessage(
                                    `Payment successful.\nTransaction: ${transaction.id}\n` +
                                    'Your receipt must be verified before a signed license is issued. ' +
                                    'Send the transaction reference and the email used in Poe Voice Sync to admin@ascensionrealmstudios.com.'
                                );
                            } else {
                                resultMessage(
                                    `Payment successful, but the extension could not record the receipt.\nTransaction: ${transaction.id}\n` +
                                    'Send this transaction reference and the email used in Poe Voice Sync to admin@ascensionrealmstudios.com.',
                                    true
                                );
                            }
                        } else if (transaction?.status === "INSTRUMENT_DECLINED") {
                            return actions.restart();
                        } else {
                            throw new Error(`Unexpected transaction status: ${transaction?.status}`);
                        }
                    } catch (error) {
                        console.error('Payment error:', error);
                        resultMessage(`Transaction failed:\n${error.message || error}`, true);
                    }
                },

                onError: function(err) {
                    console.error('PayPal error:', err);
                    resultMessage(`Payment Error:\n${err.message || err}`, true);
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
