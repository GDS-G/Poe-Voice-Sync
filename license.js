// license.js
class LicenseHandler {
    constructor() {
        this.betaSalt = 'beta_poe_voice_sync_2024';
        this.prodSalt = 'poe_voice_sync_license_2024';
        this.betaPrefix = 'BETA-';
        this.isDebugMode = false; // Debug flag for testing
    }

    setDebugMode(enabled) {
        this.isDebugMode = enabled;
        console.log(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    }

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
                newLicenseKey = await this.generateTestLicense(userEmail, true);
            } else if (mode === 'prod') {
                newLicenseKey = await this.generateTestLicense(userEmail, false);
            } else {
                return { success: false, message: 'Invalid mode. Use "beta" or "prod"' };
            }

            await Promise.all([
                chrome.storage.sync.set({
                    licenseKey: newLicenseKey,
                    licensedEmail: userEmail,
                    isActivated: true
                }),
                chrome.storage.local.set({
                    licenseKey: newLicenseKey,
                    licensedEmail: userEmail,
                    isActivated: true
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

    async generateTestLicense(userEmail, isBeta = true) {
        const encoder = new TextEncoder();
        const salt = isBeta ? this.betaSalt : this.prodSalt;
        const data = encoder.encode(userEmail + salt);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const key = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
        return isBeta ? this.betaPrefix + key : key;
    }

    async generateLicenseKey(userEmail) {
        try {
            console.log('Generating license for:', userEmail);
            const encoder = new TextEncoder();
            const data = encoder.encode(userEmail + this.betaSalt);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const licenseKey = this.betaPrefix + hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);

            const licenseData = {
                licenseKey,
                licensedEmail: userEmail,
                purchaseDate: Date.now(),
                isActivated: true
            };

            await Promise.all([
                chrome.storage.local.set(licenseData),
                chrome.storage.sync.set(licenseData)
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
            console.log('Verifying license for:', userEmail);
            const [syncData, localData] = await Promise.all([
                chrome.storage.sync.get(['licenseKey', 'licensedEmail', 'isActivated']),
                chrome.storage.local.get(['licenseKey', 'licensedEmail', 'isActivated'])
            ]);

            console.log('License data found:', { sync: syncData, local: localData });

            // Check sync storage first
            if (syncData.licenseKey && syncData.licensedEmail === userEmail && syncData.isActivated) {
                const isBetaKey = syncData.licenseKey.startsWith(this.betaPrefix);
                const salt = isBetaKey ? this.betaSalt : this.prodSalt;
                const verification = await this.verifyLicenseHash(userEmail, syncData.licenseKey, salt);

                if (verification) {
                    return {
                        success: true,
                        isValid: true,
                        licenseKey: syncData.licenseKey,
                        isBeta: isBetaKey
                    };
                }
            }

            // Check local storage if sync failed
            if (localData.licenseKey && localData.licensedEmail === userEmail && localData.isActivated) {
                const isBetaKey = localData.licenseKey.startsWith(this.betaPrefix);
                const salt = isBetaKey ? this.betaSalt : this.prodSalt;
                const verification = await this.verifyLicenseHash(userEmail, localData.licenseKey, salt);

                if (verification) {
                    // Sync the valid license data
                    await chrome.storage.sync.set({
                        licenseKey: localData.licenseKey,
                        licensedEmail: userEmail,
                        isActivated: true
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

    async verifyLicenseHash(userEmail, licenseKey, salt) {
        const encoder = new TextEncoder();
        const data = encoder.encode(userEmail + salt);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        let expectedKey = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);

        if (licenseKey.startsWith(this.betaPrefix)) {
            expectedKey = this.betaPrefix + expectedKey;
        }

        return licenseKey === expectedKey;
    }

    async restoreLicense(userEmail) {
        try {
            console.log('Attempting to restore license for:', userEmail);

            // First check both storage locations
            const [syncData, localData] = await Promise.all([
                chrome.storage.sync.get(['licenseKey', 'licensedEmail', 'purchaseDate']),
                chrome.storage.local.get(['licenseKey', 'licensedEmail', 'purchaseDate'])
            ]);

            // Use sync data if available, otherwise local
            const data = syncData.licenseKey ? syncData : localData;

            if (data.licenseKey && data.licensedEmail === userEmail) {
                console.log('Found existing license data:', data);

                // Verify the license is valid
                const isBetaKey = data.licenseKey.startsWith(this.betaPrefix);
                const salt = isBetaKey ? this.betaSalt : this.prodSalt;
                const isValid = await this.verifyLicenseHash(userEmail, data.licenseKey, salt);

                if (isValid) {
                    console.log('License key validated');

                    // Ensure data is stored in both locations
                    const licenseData = {
                        licenseKey: data.licenseKey,
                        licensedEmail: userEmail,
                        purchaseDate: data.purchaseDate || Date.now(),
                        isActivated: true
                    };

                    await Promise.all([
                        chrome.storage.sync.set(licenseData),
                        chrome.storage.local.set(licenseData)
                    ]);

                    return {
                        success: true,
                        licenseKey: data.licenseKey,
                        isBeta: isBetaKey,
                        message: 'License restored successfully'
                    };
                }
            }

            console.log('No valid license found for restoration');
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

    async getLicense() {
        try {
            const [syncData, localData] = await Promise.all([
                chrome.storage.sync.get(['licenseKey', 'licensedEmail', 'purchaseDate', 'isActivated']),
                chrome.storage.local.get(['licenseKey', 'licensedEmail', 'purchaseDate', 'isActivated'])
            ]);

            const data = syncData.licenseKey ? syncData : localData;
            const isBeta = data.licenseKey?.startsWith(this.betaPrefix) || false;

            return {
                success: true,
                licenseKey: data.licenseKey || null,
                licensedEmail: data.licensedEmail || null,
                purchaseDate: data.purchaseDate || null,
                isActivated: data.isActivated || false,
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
}

const licenseHandler = new LicenseHandler();
export default licenseHandler;