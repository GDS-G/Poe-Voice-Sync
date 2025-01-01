// license.js
class LicenseHandler {
    constructor() {
        // This key would normally be stored securely, but for testing we'll use a fixed key
        this.testKey = 'test_license_key_2024';
    }

    async generateLicenseKey(userEmail) {
        try {
            // Convert email to bytes
            const encoder = new TextEncoder();
            const data = encoder.encode(userEmail + this.testKey);
            
            // Hash the data
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            
            // Convert to hex string and take first 16 characters as license key
            const licenseKey = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
            
            return {
                success: true,
                licenseKey
            };
        } catch (error) {
            console.error('Error generating license:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async validateLicenseKey(licenseKey, userEmail) {
        try {
            // For testing, generate what the valid key should be
            const validLicense = await this.generateLicenseKey(userEmail);
            
            if (!validLicense.success) {
                throw new Error('Failed to validate license');
            }

            // Compare with provided key
            return {
                success: true,
                isValid: licenseKey === validLicense.licenseKey
            };
        } catch (error) {
            console.error('License validation error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async storeLicense(licenseKey) {
        try {
            await chrome.storage.sync.set({ licenseKey });
            return { success: true };
        } catch (error) {
            console.error('Error storing license:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getLicense() {
        try {
            const data = await chrome.storage.sync.get(['licenseKey']);
            return {
                success: true,
                licenseKey: data.licenseKey || null
            };
        } catch (error) {
            console.error('Error getting license:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // For testing: Generate and store a valid license
    async generateTestLicense(userEmail) {
        const result = await this.generateLicenseKey(userEmail);
        if (result.success) {
            await this.storeLicense(result.licenseKey);
            return {
                success: true,
                licenseKey: result.licenseKey
            };
        }
        return result;
    }
}

const licenseHandler = new LicenseHandler();
export default licenseHandler;