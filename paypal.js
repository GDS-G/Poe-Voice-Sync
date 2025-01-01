// paypal.js
class PayPalHandler {
    constructor() {
        // Replace with your production client ID
        this.PAYPAL_CLIENT_ID = 'YOUR_PRODUCTION_CLIENT_ID';
        this.PRODUCT_PRICE = '19.99';
    }

    async initPayPalButton(buttonContainer, onSuccess) {
        if (!window.paypal) {
            await this.loadPayPalScript();
        }

        buttonContainer.innerHTML = '';

        paypal.Buttons({
            style: {
                layout: 'vertical',
                color: 'blue',
                shape: 'rect',
                label: 'pay'
            },

            createOrder: (data, actions) => {
                return actions.order.create({
                    purchase_units: [{
                        amount: {
                            value: this.PRODUCT_PRICE,
                            currency_code: 'USD'
                        },
                        description: 'POE Voice Sync License'
                    }]
                });
            },

            onApprove: async (data, actions) => {
                try {
                    const order = await actions.order.capture();
                    console.log('Payment successful:', order);

                    if (onSuccess && typeof onSuccess === 'function') {
                        await onSuccess(order);
                    }

                    return order;
                } catch (error) {
                    console.error('Payment failed:', error);
                    throw error;
                }
            },

            onError: (err) => {
                console.error('PayPal error:', err);
                throw err;
            }
        }).render(buttonContainer);
    }

    async loadPayPalScript() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `https://www.paypal.com/sdk/js?client-id=${this.PAYPAL_CLIENT_ID}&currency=USD`;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load PayPal SDK'));
            document.head.appendChild(script);
        });
    }
}

const paypalHandler = new PayPalHandler();
export default paypalHandler;