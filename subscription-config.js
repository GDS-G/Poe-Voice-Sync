export const SUBSCRIPTION_CONFIG = Object.freeze({
    paymentUrl: 'https://gds-g.github.io/Poe-Voice-Sync/payment/payment.html',
    paymentOrigin: 'https://gds-g.github.io',
    paymentPath: '/Poe-Voice-Sync/payment/payment.html',
    registryUrl: 'https://gds-g.github.io/Poe-Voice-Sync/payment/licenses.json',
    registryRefreshMs: 5 * 60 * 1000,
    plans: Object.freeze({
        monthly: 'P-0XV83143JL606463WNJZHVMA',
        yearly: 'P-5D8593601E157201PNJZHWAA'
    })
});
