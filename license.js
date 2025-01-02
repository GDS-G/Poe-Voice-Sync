// license.js
class LicenseHandler {
    constructor() {
        this.betaSalt = 'beta_poe_voice_sync_2024';
        this.prodSalt = 'poe_voice_sync_license_2024';
        this.betaPrefix = 'BETA-';
        this.isDebugMode = false; // Debug flag for testing
    }

    // Enable/disable debug mode
    setDebugMode(enabled) {
        this.isDebugMode = enabled;
        console.log(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    // Force beta or prod mode for testing
    async setLicenseMode(mode) {
        if (!this.isDebugMode) return { success: false, message: 'Debug mode must be enabled' };

        try {
            const currentLicense = await this.getLicense();
            if (!currentLicense.success || !currentLicense.licenseKey) {
                return { success: false, message: 'No license found' };
            }

            const userEmail = currentLicense.licensedEmail;
            let newLicenseKey;

            if (mode === 'beta') {
                // Force beta license
                newLicenseKey = await this.generateTestLicense(userEmail, true);
            } else if (mode === 'prod') {
                // Force production license
                newLicenseKey = await this.generateTestLicense(userEmail, false);
            } else {
                return { success: false, message: 'Invalid mode. Use "beta" or "prod"' };
            }

            // Update storage with new license
            await Promise.all([
                chrome.storage.sync.set({
                    licenseKey: newLicenseKey,
                    licensedEmail: userEmail
                }),
                chrome.storage.local.set({
                    licenseKey: newLicenseKey,
                    licensedEmail: userEmail
                })
            ]);

            return {
                success: true,
                message: `License converted to ${mode} mode`,
                licenseKey: newLicenseKey
            };
        } catch (error) {
            console.error('Error setting license mode:', error);
            return { success: false, error: error.message };
        }
    }

    // Generate a test license key
    async generateTestLicense(userEmail, isBeta = true) {
        const encoder = new TextEncoder();
        const salt = isBeta ? this.betaSalt : this.prodSalt;
        const data = encoder.encode(userEmail + salt);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const key = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
        return isBeta ? this.betaPrefix + key : key;
    }

    // Activate or deactivate license
    async toggleLicenseStatus(active) {
        if (!this.isDebugMode) return { success: false, message: 'Debug mode must be enabled' };

        try {
            if (!active) {
                // Deactivate by removing license data
                await Promise.all([
                    chrome.storage.sync.remove(['licenseKey', 'licensedEmail', 'purchaseDate']),
                    chrome.storage.local.remove(['licenseKey', 'licensedEmail', 'purchaseDate'])
                ]);
                return { success: true, message: 'License deactivated' };
            } else {
                // Get current user email from auth
                const authData = await chrome.storage.sync.get(['userEmail']);
                if (!authData.userEmail) {
                    return { success: false, message: 'No user email found' };
                }

                // Generate and store new beta license
                const result = await this.generateLicenseKey(authData.userEmail);
                return {
                    success: result.success,
                    message: result.success ? 'License activated' : 'Activation failed',
                    licenseKey: result.licenseKey
                };
            }
        } catch (error) {
            console.error('Error toggling license:', error);
            return { success: false, error: error.message };
        }
    }

    // Original methods remain the same
    async generateLicenseKey(userEmail) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(userEmail + this.betaSalt);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const licenseKey = this.betaPrefix + hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);

            await Promise.all([
                chrome.storage.local.set({
                    licenseKey,
                    licensedEmail: userEmail,
                    purchaseDate: Date.now()
                }),
                chrome.storage.sync.set({
                    licenseKey,
                    licensedEmail: userEmail,
                    purchaseDate: Date.now()
                })
            ]);

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
            const syncData = await chrome.storage.sync.get(['licenseKey', 'licensedEmail']);
            if (syncData.licenseKey && syncData.licensedEmail === userEmail) {
                const isBetaKey = syncData.licenseKey.startsWith(this.betaPrefix);
                const salt = isBetaKey ? this.betaSalt : this.prodSalt;

                const encoder = new TextEncoder();
                const data = encoder.encode(userEmail + salt);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                let expectedKey = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);

                if (isBetaKey) {
                    expectedKey = this.betaPrefix + expectedKey;
                }

                if (syncData.licenseKey === expectedKey) {
                    await chrome.storage.local.set({
                        licenseKey: syncData.licenseKey,
                        licensedEmail: userEmail
                    });

                    return {
                        success: true,
                        isValid: true,
                        licenseKey: syncData.licenseKey,
                        isBeta: isBetaKey
                    };
                }
            }

            const localData = await chrome.storage.local.get(['licenseKey', 'licensedEmail']);
            if (localData.licenseKey && localData.licensedEmail === userEmail) {
                const isBetaKey = localData.licenseKey.startsWith(this.betaPrefix);
                const salt = isBetaKey ? this.betaSalt : this.prodSalt;

                const encoder = new TextEncoder();
                const data = encoder.encode(userEmail + salt);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                let expectedKey = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);

                if (isBetaKey) {
                    expectedKey = this.betaPrefix + expectedKey;
                }

                if (localData.licenseKey === expectedKey) {
                    await chrome.storage.sync.set({
                        licenseKey: localData.licenseKey,
                        licensedEmail: userEmail
                    });

                    return {
                        success: true,
                        isValid: true,
                        licenseKey: localData.licenseKey,
                        isBeta: isBetaKey
                    };
                }
            }

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
                isValid: verification.success && verification.isValid && verification.licenseKey === licenseKey,
                isBeta: verification.isBeta
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
            const [syncData, localData] = await Promise.all([
                chrome.storage.sync.get(['licenseKey', 'licensedEmail', 'purchaseDate']),
                chrome.storage.local.get(['licenseKey', 'licensedEmail', 'purchaseDate'])
            ]);

            const data = syncData.licenseKey ? syncData : localData;
            const isBeta = data.licenseKey?.startsWith(this.betaPrefix) || false;

            return {
                success: true,
                licenseKey: data.licenseKey || null,
                licensedEmail: data.licensedEmail || null,
                purchaseDate: data.purchaseDate || null,
                isBeta
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
            const verification = await this.verifyLicenseForEmail(userEmail);

            if (verification.success && verification.isValid) {
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
                    isBeta: verification.isBeta,
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