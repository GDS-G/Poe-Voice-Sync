// paypal.js
class PayPalHandler {
    constructor() {
        this.PAYPAL_CLIENT_ID = 'AWXwlfbfBOYSDikaxv7FchKUDAcTo7ObFB-qT3GEraxUnu4F6YWQPo3Y4sSAwXAht8syBpNFFV2HlvYh'; // Replace with your PayPal sandbox client ID
        this.PRODUCT_PRICE = '5.00';
    }

    async initPayPalButton(buttonContainer, onSuccess) {
        if (!window.paypal) {
            // Load PayPal SDK if not already loaded
            await this.loadPayPalScript();
        }

        // Clear existing buttons
        buttonContainer.innerHTML = '';

        // Create PayPal button
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
                    
                    // Call success callback
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