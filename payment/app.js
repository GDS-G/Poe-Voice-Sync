// app.js
(function() {
    // Helper function for showing messages
    function resultMessage(message, isError = false) {
        const messageElement = document.getElementById('result-message');
        messageElement.innerHTML = message;
        messageElement.className = isError ? 'error' : 'success';
    }

    // Get extension ID and setup logo
    const params = new URLSearchParams(window.location.search);
    const extensionId = params.get('extId');
    
    // Set logo source if extension ID is present
    if (extensionId) {
        const logoElement = document.getElementById('extension-logo');
        if (logoElement) {
            logoElement.src = `chrome-extension://${extensionId}/icons/logo.png`;
        }
    }

    // Check if PayPal is available
    if (!window.paypal) {
        resultMessage('PayPal payment system failed to load. Please refresh the page.', true);
        return;
    }

    // Initialize PayPal buttons
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

                        // Try to notify extension
                        if (extensionId) {
                            try {
                                await chrome.runtime.sendMessage(extensionId, {
                                    type: 'PAYMENT_COMPLETE',
                                    ...paymentData
                                });
                            } catch (error) {
                                console.log('Extension message failed:', error);
                            }
                        }

                        // Also try to notify any opener window
                        if (window.opener && !window.opener.closed) {
                            window.opener.postMessage({
                                type: 'PAYMENT_COMPLETE',
                                ...paymentData
                            }, '*');
                        }

                        resultMessage(`
                            Payment successful!<br>
                            Please close this window and click the extension icon to complete activation.
                        `);

                        // Wait a moment before closing
                        setTimeout(() => {
                            window.close();
                        }, 3000);

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
})();
