import { createHash, webcrypto } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PRODUCT_ID = 'poe-voice-sync';
const TOKEN_PREFIX = 'PVA1';
const PLAN_PERIODS = Object.freeze({
    'P-0XV83143JL606463WNJZHVMA': 'monthly',
    'P-5D8593601E157201PNJZHWAA': 'yearly'
});
const TOKEN_TTL_SECONDS = 72 * 60 * 60;

function argumentValue(name, fallback = '') {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : fallback;
}

function pemToArrayBuffer(pem) {
    const base64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
    return Buffer.from(base64, 'base64');
}

function base64Url(value) {
    return Buffer.from(value).toString('base64url');
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

async function importSigningKey(privatePem) {
    return webcrypto.subtle.importKey(
        'pkcs8',
        pemToArrayBuffer(privatePem),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
    );
}

export async function signAutomaticLicense(privateKey, emailHash, subscription, nowSeconds = Math.floor(Date.now() / 1000)) {
    const payload = {
        version: 2,
        product: PRODUCT_ID,
        emailHash,
        plan: PLAN_PERIODS[subscription.plan_id],
        issuedAt: nowSeconds - 60,
        expiresAt: nowSeconds + TOKEN_TTL_SECONDS,
        subscriptionHash: sha256(subscription.id)
    };
    const encodedPayload = base64Url(JSON.stringify(payload));
    const signingInput = `${TOKEN_PREFIX}.${encodedPayload}`;
    const signature = await webcrypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        Buffer.from(signingInput)
    );
    return `${signingInput}.${base64Url(signature)}`;
}

async function paypalRequest(baseUrl, accessToken, path) {
    const response = await fetch(`${baseUrl}${path}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
        }
    });
    if (!response.ok) throw new Error(`PayPal request failed (${response.status}) for ${path}.`);
    return response.json();
}

async function getAccessToken(baseUrl, clientId, clientSecret) {
    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });
    if (!response.ok) throw new Error(`PayPal authentication failed (${response.status}).`);
    const body = await response.json();
    if (!body.access_token) throw new Error('PayPal did not return an access token.');
    return body.access_token;
}

async function listActiveSubscriptions(baseUrl, accessToken) {
    const subscriptions = [];
    const planIds = Object.keys(PLAN_PERIODS).join(',');
    for (let page = 1; page <= 100000; page += 1) {
        const query = new URLSearchParams({
            plan_ids: planIds,
            statuses: 'ACTIVE',
            page_size: '20',
            page: String(page)
        });
        const body = await paypalRequest(baseUrl, accessToken, `/v1/billing/subscriptions?${query}`);
        const items = body.subscriptions || [];
        subscriptions.push(...items);
        const totalItems = Number(body.total_items);
        if (items.length < 20 || (Number.isFinite(totalItems) && totalItems > 0 && subscriptions.length >= totalItems)) break;
    }
    return subscriptions;
}

export function extractLicenseHash(subscription) {
    const match = /^pvs2-([a-f0-9]{64})$/.exec(subscription.custom_id || '');
    return match?.[1] || '';
}

async function buildRegistry(baseUrl, accessToken, privateKey) {
    const summaries = await listActiveSubscriptions(baseUrl, accessToken);
    const licenses = {};
    for (const summary of summaries) {
        if (!summary.id || !PLAN_PERIODS[summary.plan_id]) continue;
        const subscription = await paypalRequest(baseUrl, accessToken, `/v1/billing/subscriptions/${encodeURIComponent(summary.id)}`);
        if (subscription.status !== 'ACTIVE' || !PLAN_PERIODS[subscription.plan_id]) continue;
        if (Number(subscription.billing_info?.failed_payments_count || 0) > 0) continue;
        if (Number(subscription.billing_info?.outstanding_balance?.value || 0) > 0) continue;
        const emailHash = extractLicenseHash(subscription);
        if (!emailHash) continue;
        licenses[emailHash] = await signAutomaticLicense(privateKey, emailHash, subscription);
    }
    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        licenses: Object.fromEntries(Object.entries(licenses).sort(([left], [right]) => left.localeCompare(right)))
    };
}

async function main() {
    const outputPath = resolve(argumentValue('--output', 'payment/licenses.json'));
    const baseUrl = process.env.PAYPAL_API_BASE || 'https://api-m.paypal.com';
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const privatePem = process.env.PVS_AUTOMATIC_LICENSE_PRIVATE_KEY
        || (process.env.PVS_AUTOMATIC_LICENSE_PRIVATE_KEY_FILE
            ? await readFile(process.env.PVS_AUTOMATIC_LICENSE_PRIVATE_KEY_FILE, 'utf8')
            : '');
    if (!clientId || !clientSecret || !privatePem) {
        throw new Error('PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, and PVS_AUTOMATIC_LICENSE_PRIVATE_KEY are required.');
    }
    const accessToken = await getAccessToken(baseUrl, clientId, clientSecret);
    const signingKey = await importSigningKey(privatePem);
    const registry = await buildRegistry(baseUrl, accessToken, signingKey);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
    console.log(`Published ${Object.keys(registry.licenses).length} active signed subscription license(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    await main();
}
