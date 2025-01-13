function resultMessage(message, isError = false) {
    const messageElement = document.getElementById('result-message');
    messageElement.innerHTML = message;
    messageElement.className = isError ? 'error' : 'success';
}

window.paypal
    .Buttons({
        style: {
            shape: "rect",
            layout: "vertical",
            color: "gold",
            label: "paypal",
        },

        async createOrder() {
            try {
                const order = await paypal.createOrder({
                    intent: "CAPTURE",
                    purchase_units: [{
                        amount: {
                            currency_code: "USD",
                            value: "19.99"
                        },
                        description: "POE Voice Sync License"
                    }]
                });

                return order.id;
            } catch (error) {
                console.error(error);
                resultMessage(`Could not initiate PayPal Checkout...<br><br>${error}`, true);
            }
        },

        async onApprove(data, actions) {
            try {
                const orderData = await actions.order.capture();

                // Handle different transaction states
                const transaction =
                    orderData?.purchase_units?.[0]?.payments?.captures?.[0] ||
                    orderData?.purchase_units?.[0]?.payments?.authorizations?.[0];

                if (transaction?.status === "COMPLETED") {
                    // Send message to extension
                    window.opener.postMessage({
                        type: 'PAYMENT_COMPLETE',
                        orderId: orderData.id,
                        transactionId: transaction.id
                    }, '*');

                    // Close window immediately after payment
                    window.close();

                } else if (transaction?.status === "INSTRUMENT_DECLINED") {
                    return actions.restart();
                } else {
                    throw new Error(`Unexpected transaction status: ${transaction?.status}`);
                }

            } catch (error) {
                console.error(error);
                resultMessage(`
                    Sorry, your transaction could not be processed...<br><br>
                    ${error.message || error}
                `, true);
            }
        },

        onError(error) {
            console.error('PayPal error:', error);
            resultMessage(`
                PayPal checkout error:<br><br>
                ${error.message || error}
            `, true);
        }
    })
    .render("#paypal-button-container");
