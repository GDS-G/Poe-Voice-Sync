import licenseHandler from './license.js';

window.debugLicenseHandler = licenseHandler;
window.debug = {
    enableDebugMode() {
        const result = licenseHandler.setDebugMode(true);
        console.log('Poe Voice Sync debug mode enabled.', result);
        return result;
    },
    async setBetaMode() {
        const result = await licenseHandler.setLicenseMode('beta');
        console.log('Beta license mode result:', result);
        return result;
    },
    async setProductionMode() {
        const result = await licenseHandler.setLicenseMode('prod');
        console.log('Production license mode result:', result);
        return result;
    },
    async deactivateLicense() {
        const result = await licenseHandler.toggleLicenseStatus(false);
        console.log('License deactivation result:', result);
        return result;
    },
    async activateLicense() {
        const result = await licenseHandler.toggleLicenseStatus(true);
        console.log('License activation result:', result);
        return result;
    },
    async getLicenseStatus() {
        const result = await licenseHandler.getLicense();
        console.log('License status:', result);
        return result;
    }
};
