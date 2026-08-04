import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { LicenseHandler } from '../license.js';

function base64Url(value) {
    return Buffer.from(value).toString('base64url');
}

async function signedToken(privateKey, overrides = {}) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        version: 1,
        product: 'poe-voice-sync',
        email: 'owner@example.com',
        plan: 'monthly',
        issuedAt: now - 5,
        expiresAt: now + 86400,
        transactionHash: 'a'.repeat(64),
        nonce: 'test-nonce',
        ...overrides
    };
    const encodedPayload = base64Url(JSON.stringify(payload));
    const signingInput = `PVS1.${encodedPayload}`;
    const signature = await webcrypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        Buffer.from(signingInput)
    );
    return `${signingInput}.${base64Url(signature)}`;
}

function storageArea(seed = {}) {
    const data = { ...seed };
    return {
        data,
        async get(keys) {
            const result = {};
            for (const key of keys) if (key in data) result[key] = data[key];
            return result;
        },
        async set(values) { Object.assign(data, values); },
        async remove(keys) { for (const key of keys) delete data[key]; }
    };
}

test('license deactivation persists and blocks verification until reactivated', async () => {
    const sync = storageArea();
    const local = storageArea();
    globalThis.chrome = {
        storage: { sync, local },
        runtime: { async sendMessage() { return { success: true }; } }
    };
    const module = await import(`../license.js?test=${Date.now()}`);
    const license = module.default;
    const generated = await license.generateLicenseKey('owner@example.com');
    assert.equal(generated.success, true);
    assert.equal((await license.verifyLicenseForEmail('owner@example.com')).isValid, true);

    license.setDebugMode(true);
    assert.equal((await license.toggleLicenseStatus(false)).success, true);
    assert.equal((await license.verifyLicenseForEmail('owner@example.com')).isValid, false);
    assert.equal((await license.restoreLicense('owner@example.com')).isDeactivated, true);

    assert.equal((await license.toggleLicenseStatus(true)).success, true);
    assert.equal((await license.verifyLicenseForEmail('owner@example.com')).isValid, true);
});

test('beta builds recover a valid beta key from a stale production mode flag', async () => {
    const sync = storageArea();
    const local = storageArea();
    globalThis.chrome = {
        storage: { sync, local },
        runtime: { async sendMessage() { return { success: true }; } }
    };
    const module = await import(`../license.js?migration=${Date.now()}`);
    const license = module.default;
    assert.equal((await license.generateLicenseKey('owner@example.com')).success, true);
    await Promise.all([
        sync.set({ licenseMode: 'production' }),
        local.set({ licenseMode: 'production' })
    ]);

    const verification = await license.verifyLicenseForEmail('owner@example.com');
    assert.equal(verification.isValid, true);
    assert.equal(verification.isBeta, true);
});

test('beta builds ignore a stale signed token when a valid email-bound beta key remains', async () => {
    const sync = storageArea();
    const local = storageArea();
    globalThis.chrome = {
        storage: { sync, local },
        runtime: { async sendMessage() { return { success: true }; } }
    };
    const module = await import(`../license.js?signed-fallback=${Date.now()}`);
    const handler = module.default;
    const email = 'beta-fallback@example.com';
    const licenseKey = await handler.generateTestLicense(email);
    await chrome.storage.sync.set({
        licenseKey,
        signedLicense: 'PVS1.stale.invalid-token',
        licensedEmail: email,
        isActivated: true,
        licenseMode: 'production'
    });

    const result = await handler.verifyLicenseForEmail(email);
    assert.equal(result.isValid, true);
    assert.equal(result.isBeta, true);
});

test('switching to beta clears stale production credentials', async () => {
    const sync = storageArea({ signedLicense: 'PVS1.stale.token', licensePlan: 'monthly' });
    const local = storageArea({ signedLicense: 'PVS1.stale.token', licensePlan: 'monthly' });
    globalThis.chrome = {
        storage: { sync, local },
        runtime: { async sendMessage() { return { success: true }; } }
    };
    const module = await import(`../license.js?clear-production=${Date.now()}`);
    const result = await module.default.generateLicenseKey('beta-cleanup@example.com');
    assert.equal(result.success, true);
    assert.equal('signedLicense' in sync.data, false);
    assert.equal('signedLicense' in local.data, false);
    assert.equal('licensePlan' in sync.data, false);
    assert.equal('licensePlan' in local.data, false);
});

test('offline-signed production licenses are email-bound, expiring, and tamper-evident', async () => {
    const keyPair = await webcrypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
    );
    const publicKey = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
    const sync = storageArea();
    const local = storageArea();
    globalThis.chrome = {
        storage: { sync, local },
        runtime: { async sendMessage() { return { success: true }; } }
    };
    const license = new LicenseHandler(publicKey);
    const token = await signedToken(keyPair.privateKey);
    assert.equal((await license.installSignedLicense(token, 'owner@example.com')).success, true);
    const verification = await license.verifyLicenseForEmail('owner@example.com');
    assert.equal(verification.isValid, true);
    assert.equal(verification.isBeta, false);
    assert.equal(verification.plan, 'monthly');
    assert.equal((await license.verifyLicenseForEmail('different@example.com')).isValid, false);

    const tokenParts = token.split('.');
    tokenParts[2] = `${tokenParts[2].slice(0, 10)}${tokenParts[2][10] === 'A' ? 'B' : 'A'}${tokenParts[2].slice(11)}`;
    const tampered = tokenParts.join('.');
    assert.equal((await license.installSignedLicense(tampered, 'owner@example.com')).success, false);

    const expired = await signedToken(keyPair.privateKey, { issuedAt: 1, expiresAt: 2 });
    assert.equal((await license.installSignedLicense(expired, 'owner@example.com')).success, false);
});
