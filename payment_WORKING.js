document.addEventListener('DOMContentLoaded', () => {
    const testButton = document.getElementById('test-payment');
    const paypalButton = document.getElementById('paypal-payment');
    const statusDiv = document.getElementById('status');

    // Test payment handler
    testButton.addEventListener('click', async () => {
        try {
            statusDiv.className = 'status success';
            statusDiv.textContent = 'Processing test payment...';
            
            // Simulate payment processing
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Notify extension
            await chrome.runtime.sendMessage({
                type: 'PAYMENT_COMPLETE',
                orderId: 'TEST_' + Date.now()
            });
            
            statusDiv.textContent = 'Test payment successful! Activating license...';
            
            // Close window after delay
            setTimeout(() => {
                window.close();
            }, 2000);
            
        } catch (error) {
            statusDiv.className = 'status error';
            statusDiv.textContent = 'Payment failed: ' + error.message;
        }
    });

    // Real PayPal payment handler
    paypalButton.addEventListener('click', () => {
        // Open PayPal in new window
        const paypalUrl = 'https://www.paypal.com/cgi-bin/webscr?' +
            'cmd=_xclick' +
            '&business=YOUR_PAYPAL_EMAIL' +
            '&currency_code=USD' +
            '&amount=5.00' +
            '&item_name=POE Voice Sync License' +
            '&return=' + encodeURIComponent(window.location.href);
        
        window.open(paypalUrl, '_blank', 'width=800,height=600');
    });
});