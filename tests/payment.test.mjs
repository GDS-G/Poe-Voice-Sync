import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('payment page provisions monthly and yearly PayPal subscriptions with automatic activation', () => {
    const context = vm.createContext({ window: {} });
    vm.runInContext(readFileSync('payment/payment-config.js', 'utf8'), context);
    const config = context.window.POE_VOICE_SYNC_PAYMENT_CONFIG;
    assert.equal(config.plans.monthly.displayPrice, '$9.99/month');
    assert.equal(config.plans.yearly.displayPrice, '$99.99/year');

    const paymentApp = readFileSync('payment/app.js', 'utf8');
    assert.match(paymentApp, /actions\.subscription\.create/);
    assert.match(paymentApp, /PVS_PAYMENT_APPROVAL/);
    assert.match(paymentApp, /custom_id: `pvs2-\$\{licenseHash\}`/);
    assert.match(paymentApp, /Secure activation is automatic/);
    assert.doesNotMatch(paymentApp, /generateLicense|License Active/);

    const background = readFileSync('background.js', 'utf8');
    const bridge = readFileSync('payment-bridge.js', 'utf8');
    assert.match(background, /BEGIN_PAYPAL_CHECKOUT/);
    assert.match(background, /awaiting-signed-registry/);
    assert.match(background, /refreshAutomaticLicense\(authState\.userEmail, \{ force: true \}\)/);
    assert.doesNotMatch(background, /activateProvisionalSubscription|provisionalAccess/);
    assert.match(background, /pendingCheckout\.nonce !== checkoutNonce/);
    assert.doesNotMatch(background, /pending-manual-verification/);
    assert.doesNotMatch(background, /client-capture-beta/);
    assert.match(bridge, /PAYPAL_SUBSCRIPTION_APPROVED/);
    assert.match(bridge, /event\.source !== window \|\| event\.origin !== PAYMENT_ORIGIN/);
    assert.doesNotMatch(bridge, /api-m\.paypal\.com|clientSecret|privateKey/);
});
