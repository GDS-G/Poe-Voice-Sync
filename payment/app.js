// app.js
function resultMessage(message, isError = false) {
    const messageElement = document.getElementById('result-message');
    messageElement.innerHTML = message;
    messageElement.className = isError ? 'error' : 'success';
}

// Get extension ID from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const extensionId = urlParams.get('extId');

function notifyPaymentComplete(paymentData) {
    // Try to notify opener window first
    if (window.opener && !window.opener.closed) {
        window.opener.postMessage({
            type: 'PAYMENT_COMPLETE',
            ...paymentData
        }, '*');
    }

    // Also try to send message to extension
    if (extensionId) {
        try {
            chrome.runtime.sendMessage(extensionId, {
                type: 'PAYMENT_COMPLETE',
                ...paymentData
            });
        } catch (error) {
            console.log('Extension message failed:', error);
        }
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

                    // Notify about payment completion
                    notifyPaymentComplete(paymentData);

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
