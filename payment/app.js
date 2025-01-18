// app.js
function resultMessage(message, isError = false) {
    const messageElement = document.getElementById('result-message');
    messageElement.innerHTML = message;
    messageElement.className = isError ? 'error' : 'success';
}

// Store extension ID from URL for communication
const extensionId = new URLSearchParams(window.location.search).get('extId');

// Function to communicate with extension
async function notifyExtension(paymentData) {
    if (!extensionId) {
        throw new Error('Extension ID not found');
    }

    // Store in localStorage first as backup
    localStorage.setItem('poeVoiceSyncPayment', JSON.stringify({
        type: 'PAYMENT_COMPLETE',
        ...paymentData,
        timestamp: Date.now()
    }));

    // Then try to send message directly to extension
    try {
        await chrome.runtime.sendMessage(extensionId, {
            type: 'PAYMENT_COMPLETE',
            ...paymentData
        });
    } catch (error) {
        console.log('Direct message failed, using localStorage backup');
    }
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
                    resultMessage(`
                        Payment successful!<br>
                        Processing license activation...
                    `);

                    const paymentData = {
                        orderId: orderData.id,
                        transactionId: transaction.id
                    };

                    try {
                        await notifyExtension(paymentData);
                        
                        resultMessage(`
                            Payment successful!<br>
                            Please close this window and click the extension icon to complete activation.
                        `);

                        // Wait a moment before closing
                        setTimeout(() => {
                            window.close();
                        }, 3000);
                    } catch (error) {
                        console.error('Communication error:', error);
                        resultMessage(`
                            Payment successful! However, there was a communication error.<br>
                            Please close this window and click the extension icon to complete activation.<br>
                            If activation fails, please refresh the extension.
                        `);
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
    .render("#paypal-button-container");
