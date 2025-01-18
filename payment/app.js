// app.js
function resultMessage(message, isError = false) {
    const messageElement = document.getElementById('result-message');
    messageElement.innerHTML = message;
    messageElement.className = isError ? 'error' : 'success';
}

// Store extension ID from URL for communication
const extensionId = new URLSearchParams(window.location.search).get('extId');

// Function to store payment data in localStorage
function storePaymentData(paymentData) {
    const data = {
        type: 'PAYMENT_COMPLETE',
        ...paymentData,
        timestamp: Date.now()
    };
    
    // Store in both regular localStorage and sessionStorage as backup
    localStorage.setItem('poeVoiceSyncPayment', JSON.stringify(data));
    sessionStorage.setItem('poeVoiceSyncPayment', JSON.stringify(data));
    
    // Also store in a cookie as a final fallback
    document.cookie = `poeVoiceSyncPayment=${encodeURIComponent(JSON.stringify(data))}; path=/; max-age=3600`;
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

                    // Try direct messaging first
                    try {
                        if (extensionId) {
                            await chrome.runtime.sendMessage(extensionId, {
                                type: 'PAYMENT_COMPLETE',
                                ...paymentData
                            });
                        }
                    } catch (error) {
                        console.log('Direct message failed, using localStorage backup');
                    }

                    // Store payment data in multiple places
                    storePaymentData(paymentData);

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
    .render("#paypal-button-container");
