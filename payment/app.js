// app.js
function resultMessage(message, isError = false) {
    const messageElement = document.getElementById('result-message');
    messageElement.innerHTML = message;
    messageElement.className = isError ? 'error' : 'success';
}

// Get the extension ID from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const extId = urlParams.get('extId');

// Function to communicate with extension
function notifyExtension(paymentData) {
    return new Promise((resolve, reject) => {
        if (!extId) {
            reject(new Error('Extension ID not found'));
            return;
        }

        // Try to send message directly to extension
        chrome.runtime.sendMessage(extId, {
            type: 'PAYMENT_COMPLETE',
            ...paymentData
        }, response => {
            if (chrome.runtime.lastError) {
                // If direct messaging fails, store in localStorage
                localStorage.setItem('poeVoiceSyncPayment', JSON.stringify({
                    type: 'PAYMENT_COMPLETE',
                    ...paymentData,
                    timestamp: Date.now()
                }));
                resolve('stored');
            } else {
                resolve('sent');
            }
        });
    });
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
                        // Attempt to notify extension
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
    .render("#paypal-button-container");
