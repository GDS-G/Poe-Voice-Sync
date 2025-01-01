// license.js
class LicenseHandler {
    constructor() {
        this.testKey = 'poe_voice_sync_license_2024';
    }

    async generateLicenseKey(userEmail) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(userEmail + this.testKey);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const licenseKey = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);

            // Store both locally and in sync storage
            await chrome.storage.local.set({
                licenseKey,
                licensedEmail: userEmail,
                purchaseDate: Date.now()
            });

            await chrome.storage.sync.set({
                licenseKey,
                licensedEmail: userEmail,
                purchaseDate: Date.now()
            });

            return {
                success: true,
                licenseKey,
                userEmail
            };
        } catch (error) {
            console.error('Error generating license:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async verifyLicenseForEmail(userEmail) {
        try {
            // First check sync storage
            const syncData = await chrome.storage.sync.get(['licenseKey', 'licensedEmail']);
            if (syncData.licenseKey && syncData.licensedEmail === userEmail) {
                // Verify the license is valid for this email
                const encoder = new TextEncoder();
                const data = encoder.encode(userEmail + this.testKey);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const expectedKey = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);

                if (syncData.licenseKey === expectedKey) {
                    // Update local storage for redundancy
                    await chrome.storage.local.set({
                        licenseKey: syncData.licenseKey,
                        licensedEmail: userEmail
                    });

                    return {
                        success: true,
                        isValid: true,
                        licenseKey: syncData.licenseKey
                    };
                }
            }

            // If not found in sync, check local storage
            const localData = await chrome.storage.local.get(['licenseKey', 'licensedEmail']);
            if (localData.licenseKey && localData.licensedEmail === userEmail) {
                // Verify the local license
                const encoder = new TextEncoder();
                const data = encoder.encode(userEmail + this.testKey);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const expectedKey = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);

                if (localData.licenseKey === expectedKey) {
                    // Update sync storage
                    await chrome.storage.sync.set({
                        licenseKey: localData.licenseKey,
                        licensedEmail: userEmail
                    });

                    return {
                        success: true,
                        isValid: true,
                        licenseKey: localData.licenseKey
                    };
                }
            }

            // No valid license found
            return {
                success: true,
                isValid: false
            };
        } catch (error) {
            console.error('Error verifying license:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async validateLicenseKey(licenseKey, userEmail) {
        try {
            const verification = await this.verifyLicenseForEmail(userEmail);
            return {
                success: verification.success,
                isValid: verification.success && verification.isValid && verification.licenseKey === licenseKey
            };
        } catch (error) {
            console.error('License validation error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getLicense() {
        try {
            // Check both storages
            const [syncData, localData] = await Promise.all([
                chrome.storage.sync.get(['licenseKey', 'licensedEmail', 'purchaseDate']),
                chrome.storage.local.get(['licenseKey', 'licensedEmail', 'purchaseDate'])
            ]);

            // Prefer sync storage data
            const data = syncData.licenseKey ? syncData : localData;

            return {
                success: true,
                licenseKey: data.licenseKey || null,
                licensedEmail: data.licensedEmail || null,
                purchaseDate: data.purchaseDate || null
            };
        } catch (error) {
            console.error('Error getting license:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async restoreLicense(userEmail) {
        try {
            // Verify if this email has a valid license
            const verification = await this.verifyLicenseForEmail(userEmail);

            if (verification.success && verification.isValid) {
                // Update both storages
                await Promise.all([
                    chrome.storage.sync.set({
                        licenseKey: verification.licenseKey,
                        licensedEmail: userEmail
                    }),
                    chrome.storage.local.set({
                        licenseKey: verification.licenseKey,
                        licensedEmail: userEmail
                    })
                ]);

                return {
                    success: true,
                    licenseKey: verification.licenseKey,
                    message: 'License restored successfully'
                };
            }

            return {
                success: false,
                message: 'No valid license found for this email'
            };
        } catch (error) {
            console.error('Error restoring license:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

const licenseHandler = new LicenseHandler();
export default licenseHandler;