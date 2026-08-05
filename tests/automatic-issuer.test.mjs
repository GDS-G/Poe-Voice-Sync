import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { extractLicenseHash, signAutomaticLicense } from '../scripts/sync-paypal-licenses.mjs';
import { verifyLicenseToken } from '../license-token.js';

test('automatic issuer accepts only hashed Poe Voice Sync checkout bindings', () => {
    const hash = 'a'.repeat(64);
    assert.equal(extractLicenseHash({ custom_id: `pvs2-${hash}` }), hash);
    assert.equal(extractLicenseHash({ custom_id: 'owner@example.com' }), '');
    assert.equal(extractLicenseHash({ custom_id: `pvs2-${'z'.repeat(64)}` }), '');
});

test('automatic issuer produces browser-verifiable privacy-safe tokens', async () => {
    const keyPair = await webcrypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
    );
    const publicKey = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
    const email = 'subscriber@example.com';
    const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
    const emailHash = Buffer.from(digest).toString('hex');
    const token = await signAutomaticLicense(keyPair.privateKey, emailHash, {
        id: 'I-ABCDEFGHIJKL',
        plan_id: 'P-0XV83143JL606463WNJZHVMA'
    });
    assert.doesNotMatch(token, /subscriber@example\.com|I-ABCDEFGHIJKL/);
    assert.equal((await verifyLicenseToken(token, email, publicKey)).success, true);
});
