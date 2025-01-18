// background.js
import authHandler from './auth.js';
import licenseHandler from './license.js';

// Function to handle payment completion
async function handlePaymentComplete(orderId, transactionId) {
    try {
        console.log('Starting payment completion handler');

        // Get user email
        const authState = await authHandler.getAuthState();
        console.log('Auth state:', authState);

        if (!authState.isAuthenticated) {
            throw new Error('User must be signed in to activate license');
        }

        // Clear any existing data first
        await Promise.all([
            chrome.storage.sync.remove(['licenseKey', 'licensedEmail', 'purchaseDate', 'orderId']),
            chrome.storage.local.remove(['licenseKey', 'licensedEmail', 'purchaseDate', 'orderId'])
        ]);

        // Generate and store license
        const licenseResult = await licenseHandler.generateLicenseKey(authState.userEmail);
        console.log('License generation result:', licenseResult);

        if (!licenseResult.success) {
            throw new Error('Failed to generate license');
        }

        // Store license data
        const licenseData = {
            licenseKey: licenseResult.licenseKey,
            orderId,
            transactionId,
            licensedEmail: authState.userEmail,
            purchaseDate: Date.now(),
            isActivated: true
        };

        console.log('Storing license data:', licenseData);

        // Store new data
        await Promise.all([
            chrome.storage.sync.set(licenseData),
            chrome.storage.local.set(licenseData)
        ]);

        console.log('License data stored successfully');

        // Notify about license update
        try {
            await chrome.runtime.sendMessage({
                type: 'LICENSE_UPDATED',
                success: true,
                licenseKey: licenseResult.licenseKey
            });
            console.log('License update notification sent');
        } catch (e) {
            console.log('No listeners for license update message');
        }

        return { success: true };
    } catch (error) {
        console.error('Error handling payment:', error);
        throw error;
    }
}

// Listen for messages
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    console.log("External message received:", request);

    if (request.type === "PAYMENT_COMPLETE") {
        handlePaymentComplete(request.orderId, request.transactionId)
            .then(() => {
                sendResponse({ status: "success" });
                // Try to open popup after successful payment
                chrome.action.openPopup().catch(console.error);
            })
            .catch((error) => {
                console.error("Error processing payment:", error);
                sendResponse({
                    status: "error",
                    message: error.message
                });
            });
        return true; // Keep the message channel open
    }

    return false;
});