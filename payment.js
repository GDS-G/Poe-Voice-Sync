document.addEventListener('DOMContentLoaded', () => {
    const paypalButton = document.getElementById('paypal-button');
    const statusMessage = document.getElementById('status-message');

    function showMessage(message, isError = false) {
        statusMessage.textContent = message;
        statusMessage.className = isError ? 'error' : 'success';
        statusMessage.style.display = 'block';
    }

    paypalButton.addEventListener('click', () => {
        // Open PayPal checkout in a new window
        const paypalUrl = 'https://www.paypal.com/checkout?token=YOUR_SANDBOX_TOKEN&amount=19.99&currency=USD';
        const width = 500;
        const height = 600;
        const left = (screen.width - width) / 2;
        const top = (screen.height - height) / 2;

        window.open(
            paypalUrl,
            'PayPal Checkout',
            `width=${width},height=${height},left=${left},top=${top}`
        );

        // Listen for messages from the payment window
        window.addEventListener('message', async (event) => {
            if (event.origin === 'https://www.paypal.com') {
                if (event.data.paymentSuccess) {
                    try {
                        await chrome.runtime.sendMessage({
                            type: 'PAYMENT_COMPLETE',
                            orderId: event.data.orderId
                        });

                        showMessage('Payment successful! License activated.');

                        setTimeout(() => {
                            window.close();
                        }, 2000);
                    } catch (error) {
                        showMessage('Error activating license: ' + error.message, true);
                    }
                }
            }
        });
    });
});