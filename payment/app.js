// app.js
function resultMessage(message) {
    const messageElement = document.getElementById('result-message');
    messageElement.innerHTML = message;
}

// Function to store payment data in localStorage
function storePaymentData(orderId, transactionId) {
    const paymentData = {
        type: 'PAYMENT_COMPLETE',
        orderId: orderId,
        transactionId: transactionId,
        timestamp: Date.now()
    };
    localStorage.setItem('poeVoiceSyncPayment', JSON.stringify(paymentData));
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
                        Transaction ID: ${transaction.id}<br>
                        Processing license activation...
                    `);

                    // Try to use window.opener first
                    if (window.opener && !window.opener.closed) {
                        window.opener.postMessage({
                            type: 'PAYMENT_COMPLETE',
                            orderId: orderData.id,
                            transactionId: transaction.id
                        }, '*');

                        // Store data in localStorage as backup
                        storePaymentData(orderData.id, transaction.id);

                        // Close the window after a delay
                        setTimeout(() => {
                            window.close();
                        }, 2000);
                    } else {
                        // If window.opener is not available, store in localStorage and show message
                        storePaymentData(orderData.id, transaction.id);
                        resultMessage(`
                            Payment successful!<br>
                            Please close this window and click the extension icon to complete activation.
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
