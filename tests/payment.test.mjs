import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('payment page provisions monthly and yearly PayPal subscriptions without client-side activation', () => {
    const context = vm.createContext({ window: {} });
    vm.runInContext(readFileSync('payment/payment-config.js', 'utf8'), context);
    const config = context.window.POE_VOICE_SYNC_PAYMENT_CONFIG;
    assert.equal(config.plans.monthly.displayPrice, '$9.99/month');
    assert.equal(config.plans.yearly.displayPrice, '$99.99/year');

    const paymentApp = readFileSync('payment/app.js', 'utf8');
    assert.match(paymentApp, /actions\.subscription\.create/);
    assert.match(paymentApp, /PAYPAL_SUBSCRIPTION_APPROVED/);
    assert.doesNotMatch(paymentApp, /generateLicense|License Active/);

    const background = readFileSync('background.js', 'utf8');
    assert.match(background, /pending-manual-verification/);
    assert.doesNotMatch(background, /client-capture-beta/);
});
