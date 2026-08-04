import { createHash, randomBytes, webcrypto } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LICENSE_TOKEN_PREFIX, LICENSE_TOKEN_PRODUCT, normalizeLicensedEmail } from '../license-token.js';

function argument(name) {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : '';
}

function base64Url(value) {
    return Buffer.from(value).toString('base64url');
}

function pemToBytes(pem) {
    return Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');
}

const email = normalizeLicensedEmail(argument('email'));
const transaction = argument('transaction').trim();
const plan = argument('plan').trim() || 'manual-paid';
const days = Number(argument('days'));
const expiresArgument = argument('expires').trim();

if (!email || !email.includes('@')) throw new Error('Use --email buyer@example.com.');
if (!transaction || transaction.length < 8) throw new Error('Use --transaction with the PayPal transaction or subscription reference you verified.');
if (!expiresArgument && (!Number.isInteger(days) || days < 1 || days > 3660)) {
    throw new Error('Use either --days 31 or --expires YYYY-MM-DD.');
}

const nowSeconds = Math.floor(Date.now() / 1000);
const expiresAt = expiresArgument
    ? Math.floor(new Date(`${expiresArgument}T23:59:59Z`).getTime() / 1000)
    : nowSeconds + days * 86400;
if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds) throw new Error('The requested expiration must be in the future.');

const transactionHash = createHash('sha256').update(transaction).digest('hex');
const secretsDirectory = resolve(process.env.PVS_SECRETS_DIR || '../Poe-Voice-Sync-Secrets');
const ledgerPath = resolve(secretsDirectory, 'license-ledger.json');
const privateKeyPath = resolve(secretsDirectory, 'poe-voice-sync-private-key.pem');
let ledger = { version: 1, issuedTransactions: {} };
try { ledger = JSON.parse(await readFile(ledgerPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (ledger.issuedTransactions[transactionHash]) {
    throw new Error('This PayPal transaction has already been used to issue a license.');
}

const payload = {
    version: 1,
    product: LICENSE_TOKEN_PRODUCT,
    email,
    plan,
    issuedAt: nowSeconds,
    expiresAt,
    transactionHash,
    nonce: randomBytes(16).toString('base64url')
};
const encodedPayload = base64Url(JSON.stringify(payload));
const signingInput = `${LICENSE_TOKEN_PREFIX}.${encodedPayload}`;
const privateKey = await webcrypto.subtle.importKey(
    'pkcs8',
    pemToBytes(await readFile(privateKeyPath, 'utf8')),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
);
const signature = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    Buffer.from(signingInput)
);
const token = `${signingInput}.${base64Url(signature)}`;
const tokenHash = createHash('sha256').update(token).digest('hex');

ledger.issuedTransactions[transactionHash] = { email, plan, issuedAt: nowSeconds, expiresAt, tokenHash };
await mkdir(secretsDirectory, { recursive: true });
await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
await writeFile(resolve(secretsDirectory, `license-${tokenHash.slice(0, 16)}.txt`), `${token}\n`, { encoding: 'utf8', mode: 0o600 });

console.log(token);
