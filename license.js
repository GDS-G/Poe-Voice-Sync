import productionLicensePublicKey from './license-public-key.js';
import automaticLicensePublicKey from './automatic-license-public-key.js';
import { ALLOW_BETA_LICENSES } from './license-config.js';
import { AUTOMATIC_LICENSE_TOKEN_PREFIX, hashLicensedEmail, normalizeLicensedEmail, verifyLicenseToken } from './license-token.js';
import { SUBSCRIPTION_CONFIG } from './subscription-config.js';

export class LicenseHandler {
    constructor(publicKey = productionLicensePublicKey, automaticPublicKey = automaticLicensePublicKey) {
        this.betaSalt = 'beta_poe_voice_sync_2024';
        this.betaPrefix = 'BETA-';
        this.isDebugMode = false;
        this.productionLicensePublicKey = publicKey;
        this.automaticLicensePublicKey = automaticPublicKey;
    }

    setDebugMode(enabled) {
        this.isDebugMode = Boolean(enabled);
        return { success: true, enabled: this.isDebugMode };
    }

    async hashBetaLicense(userEmail) {
        const encoder = new TextEncoder();
        const digest = await crypto.subtle.digest('SHA-256', encoder.encode(userEmail + this.betaSalt));
        const key = Array.from(new Uint8Array(digest))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('')
            .substring(0, 16);
        return this.betaPrefix + key;
    }

    async generateTestLicense(userEmail) {
        return this.hashBetaLicense(userEmail);
    }

    async generateLicenseKey(userEmail, { isBeta = true, paymentData = {} } = {}) {
        try {
            if (!ALLOW_BETA_LICENSES) throw new Error('Beta license generation is disabled in this production build.');
            if (!isBeta) throw new Error('Production licenses must be signed by the offline issuer or a future verification server.');
            if (!userEmail) throw new Error('A licensed email is required.');
            const licenseKey = await this.hashBetaLicense(userEmail);
            const licenseData = {
                licenseKey,
                licensedEmail: userEmail,
                purchaseDate: Date.now(),
                isActivated: true,
                licenseMode: 'beta',
                paymentVerification: 'beta-test-only',
                ...paymentData
            };
            const productionOnlyKeys = [
                'signedLicense', 'expiresAt', 'licensePlan', 'transactionHash',
                'orderId', 'transactionId', 'paymentReceipt'
            ];
            await Promise.all([
                chrome.storage.local.remove(productionOnlyKeys),
                chrome.storage.sync.remove(productionOnlyKeys),
                chrome.storage.local.set(licenseData),
                chrome.storage.sync.set(licenseData)
            ]);
            return { success: true, licenseKey, userEmail, isBeta: true };
        } catch (error) {
            console.error('Error generating license:', error);
            return { success: false, error: error.message };
        }
    }

    async verifyBetaLicense(userEmail, licenseKey) {
        if (!userEmail || !licenseKey?.startsWith(this.betaPrefix)) return false;
        return licenseKey === await this.hashBetaLicense(userEmail);
    }

    async readStoredLicense() {
        const keys = [
            'licenseKey', 'signedLicense', 'licensedEmail', 'purchaseDate', 'expiresAt',
            'isActivated', 'licenseMode', 'licensePlan', 'transactionHash', 'orderId',
            'transactionId', 'paymentVerification', 'paymentReceipt',
            'lastRegistryCheck'
        ];
        const [syncData, localData] = await Promise.all([
            chrome.storage.sync.get(keys),
            chrome.storage.local.get(keys)
        ]);
        if (syncData.signedLicense || syncData.licenseKey) return syncData;
        return localData;
    }

    async verifyStoredCredentials(userEmail, data) {
        if (data.signedLicense) {
            const isAutomatic = data.signedLicense.startsWith(`${AUTOMATIC_LICENSE_TOKEN_PREFIX}.`);
            const publicKey = isAutomatic ? this.automaticLicensePublicKey : this.productionLicensePublicKey;
            const result = await verifyLicenseToken(data.signedLicense, userEmail, publicKey);
            if (result.success) return { isValid: true, isBeta: false, payload: result.payload };

            // A beta tester may have a stale or incomplete production token from
            // earlier payment-stub testing alongside their valid beta key. Only
            // beta builds may fall back, and the fallback remains email-bound and
            // cryptographically derived. Store packages disable this path through
            // ALLOW_BETA_LICENSES=false.
            const hasValidBetaFallback = ALLOW_BETA_LICENSES
                && await this.verifyBetaLicense(userEmail, data.licenseKey);
            if (hasValidBetaFallback) return { isValid: true, isBeta: true };
            return { isValid: false, isBeta: false, error: result.error };
        }
        // Treat the cryptographically derived key prefix as the source of truth in
        // beta builds. Older debug sessions can leave licenseMode="production"
        // behind even though the stored credential is still a valid BETA key.
        // Production packages set ALLOW_BETA_LICENSES=false, so this migration path
        // is never available in a store build.
        const isBeta = ALLOW_BETA_LICENSES && await this.verifyBetaLicense(userEmail, data.licenseKey);
        return { isValid: isBeta, isBeta, error: isBeta ? null : 'No authentic signed production license was found.' };
    }

    async verifyLicenseForEmail(userEmail) {
        try {
            const data = await this.readStoredLicense();
            if ((!data.signedLicense && !data.licenseKey) || normalizeLicensedEmail(data.licensedEmail) !== normalizeLicensedEmail(userEmail) || data.isActivated !== true) {
                return { success: true, isValid: false, isActivated: data.isActivated === true };
            }
            const verified = await this.verifyStoredCredentials(userEmail, data);
            return {
                success: true,
                isValid: verified.isValid,
                isActivated: data.isActivated === true,
                licenseKey: verified.isValid ? data.licenseKey || null : null,
                isBeta: verified.isBeta,
                expiresAt: verified.payload?.expiresAt || null,
                plan: verified.payload?.plan || data.licensePlan || null,
                error: verified.isValid ? null : verified.error
            };
        } catch (error) {
            console.error('Error verifying license:', error);
            return { success: false, isValid: false, error: error.message };
        }
    }

    async restoreLicense(userEmail) {
        try {
            const data = await this.readStoredLicense();
            if ((!data.signedLicense && !data.licenseKey) || normalizeLicensedEmail(data.licensedEmail) !== normalizeLicensedEmail(userEmail)) {
                return { success: false, message: 'No license was found for this email.' };
            }
            if (data.isActivated !== true) {
                return { success: false, isDeactivated: true, message: 'The license is deactivated.' };
            }
            const verified = await this.verifyStoredCredentials(userEmail, data);
            if (!verified.isValid) return { success: false, message: verified.error || 'The stored license is invalid.' };
            const licenseData = { ...data, isActivated: true };
            await Promise.all([
                chrome.storage.sync.set(licenseData),
                chrome.storage.local.set(licenseData)
            ]);
            return {
                success: true,
                licenseKey: data.licenseKey || null,
                isBeta: verified.isBeta,
                expiresAt: verified.payload?.expiresAt || null,
                message: 'License restored successfully.'
            };
        } catch (error) {
            console.error('Error restoring license:', error);
            return { success: false, error: error.message };
        }
    }

    async installSignedLicense(token, userEmail) {
        const normalizedEmail = normalizeLicensedEmail(userEmail);
        const isAutomatic = String(token).trim().startsWith(`${AUTOMATIC_LICENSE_TOKEN_PREFIX}.`);
        const publicKey = isAutomatic ? this.automaticLicensePublicKey : this.productionLicensePublicKey;
        const verification = await verifyLicenseToken(token, normalizedEmail, publicKey);
        if (!verification.success) return verification;
        const { payload } = verification;
        const licenseData = {
            signedLicense: String(token).trim(),
            licenseKey: null,
            licensedEmail: normalizedEmail,
            purchaseDate: payload.issuedAt * 1000,
            expiresAt: payload.expiresAt,
            licensePlan: payload.plan,
            transactionHash: payload.transactionHash || payload.subscriptionHash,
            paymentVerification: isAutomatic ? 'automatic-paypal-registry' : 'offline-signed',
            licenseMode: 'production',
            isActivated: true
        };
        await Promise.all([
            chrome.storage.sync.set(licenseData),
            chrome.storage.local.set(licenseData)
        ]);
        try { await chrome.runtime.sendMessage({ type: 'LICENSE_UPDATED' }); } catch (_) { }
        return { success: true, isBeta: false, expiresAt: payload.expiresAt, plan: payload.plan };
    }

    async refreshAutomaticLicense(userEmail, { force = false } = {}) {
        const normalizedEmail = normalizeLicensedEmail(userEmail);
        if (!normalizedEmail) return { success: false, error: 'A license email is required.' };
        const { lastRegistryCheck = 0 } = await chrome.storage.local.get(['lastRegistryCheck']);
        if (!force && Date.now() - lastRegistryCheck < SUBSCRIPTION_CONFIG.registryRefreshMs) {
            return { success: true, skipped: true };
        }
        await chrome.storage.local.set({ lastRegistryCheck: Date.now() });
        try {
            const response = await fetch(`${SUBSCRIPTION_CONFIG.registryUrl}?v=${Date.now()}`, { cache: 'no-store' });
            if (!response.ok) throw new Error(`License service returned HTTP ${response.status}.`);
            const registry = await response.json();
            if (registry.version !== 1 || !registry.licenses || typeof registry.licenses !== 'object') {
                throw new Error('The automatic license registry is invalid.');
            }
            const emailHash = await hashLicensedEmail(normalizedEmail);
            const token = registry.licenses[emailHash];
            if (token) return this.installSignedLicense(token, normalizedEmail);

            const stored = await this.readStoredLicense();
            if (stored.signedLicense?.startsWith(`${AUTOMATIC_LICENSE_TOKEN_PREFIX}.`)) {
                const keys = ['signedLicense', 'expiresAt', 'transactionHash'];
                await Promise.all([chrome.storage.sync.remove(keys), chrome.storage.local.remove(keys)]);
            }
            return { success: true, found: false };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async toggleLicenseStatus(activated) {
        if (!this.isDebugMode) return { success: false, message: 'Debug mode must be enabled.' };
        if (!ALLOW_BETA_LICENSES) return { success: false, message: 'Beta mode is disabled in this production build.' };
        const data = await this.readStoredLicense();
        if ((!data.signedLicense && !data.licenseKey) || !data.licensedEmail) return { success: false, message: 'No license found.' };
        const verified = await this.verifyStoredCredentials(data.licensedEmail, data);
        if (!verified.isValid) return { success: false, message: verified.error || 'The stored license is invalid.' };
        const update = { isActivated: Boolean(activated) };
        await Promise.all([chrome.storage.sync.set(update), chrome.storage.local.set(update)]);
        try { await chrome.runtime.sendMessage({ type: 'LICENSE_UPDATED' }); } catch (_) { }
        return { success: true, isActivated: Boolean(activated) };
    }

    async setLicenseMode(mode) {
        if (!this.isDebugMode) return { success: false, message: 'Debug mode must be enabled.' };
        if (mode === 'prod') return { success: false, message: 'Production mode requires an offline-signed license token.' };
        if (mode !== 'beta') return { success: false, message: 'Use beta or prod.' };
        const data = await this.readStoredLicense();
        if (!data.licensedEmail) return { success: false, message: 'No license found.' };
        return this.generateLicenseKey(data.licensedEmail, { isBeta: true });
    }

    async getLicense() {
        try {
            const data = await this.readStoredLicense();
            return {
                success: true,
                licenseKey: data.licenseKey || null,
                hasSignedLicense: Boolean(data.signedLicense),
                licensedEmail: data.licensedEmail || null,
                purchaseDate: data.purchaseDate || null,
                expiresAt: data.expiresAt || null,
                isActivated: data.isActivated === true,
                isBeta: data.licenseKey?.startsWith(this.betaPrefix) || false,
                licenseMode: data.licenseMode || null,
                licensePlan: data.licensePlan || null,
                paymentVerification: data.paymentVerification || null
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

const licenseHandler = new LicenseHandler();
export default licenseHandler;
