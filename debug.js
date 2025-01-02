// debug.js
import licenseHandler from './license.js';

// Expose license handler for debugging
window.debugLicenseHandler = licenseHandler;

// Add debug helper functions
window.debug = {
    async enableDebugMode() {
        await window.debugLicenseHandler.setDebugMode(true);
        console.log('Debug mode enabled');
    },
    
    async setBetaMode() {
        await window.debugLicenseHandler.setLicenseMode('beta');
        console.log('Beta mode enabled');
    },
    
    async setProductionMode() {
        await window.debugLicenseHandler.setLicenseMode('prod');
        console.log('Production mode enabled');
    },
    
    async deactivateLicense() {
        await window.debugLicenseHandler.toggleLicenseStatus(false);
        console.log('License deactivated');
    },
    
    async activateLicense() {
        await window.debugLicenseHandler.toggleLicenseStatus(true);
        console.log('License activated');
    },
    
    async getLicenseStatus() {
        const status = await window.debugLicenseHandler.getLicense();
        console.log('License status:', status);
        return status;
    }
};