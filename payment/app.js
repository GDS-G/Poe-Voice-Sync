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
                    // Send message to parent window (Chrome extension)
                    window.opener.postMessage({
                        type: 'PAYMENT_COMPLETE',
                        orderId: orderData.id,
                        transactionId: transaction.id
                    }, '*');

                    resultMessage(`
                        Payment successful!<br>
                        Transaction ID: ${transaction.id}<br>
                        Processing license activation...
                    `);

                    // Close window after delay
                    setTimeout(() => {
                        window.close();
                    }, 3000);
                } else {
                    throw new Error(`Transaction status: ${transaction?.status}`);
                }
            } catch (error) {
                console.error(error);
                resultMessage(`
                    Transaction failed:<br>
                    ${error.message || error}
                `);
            }
        },

        onError: function(err) {
            console.error(err);
            resultMessage(`
                Payment Error:<br>
                ${err.message || err}
            `);
        }
    })
    .render("#paypal-button-container");