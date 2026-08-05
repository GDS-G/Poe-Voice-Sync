import { webcrypto } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeLicensedEmail, REVIEW_LICENSE_TOKEN_PREFIX } from '../license-token.js';

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
const days = Number(argument('days'));
if (!email || !email.includes('@')) throw new Error('Use --email reviewer@example.com.');
if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('Use --days between 1 and 365.');

const expiresAt = Math.floor(Date.now() / 1000) + days * 86400;
const encodedExpiry = expiresAt.toString(36);
const signingInput = `${REVIEW_LICENSE_TOKEN_PREFIX}.${email}.${encodedExpiry}`;
const secretsDirectory = resolve(process.env.PVS_SECRETS_DIR || '../Poe-Voice-Sync-Secrets');
const privateKeyPath = resolve(secretsDirectory, 'poe-voice-sync-private-key.pem');
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
const token = `${REVIEW_LICENSE_TOKEN_PREFIX}.${encodedExpiry}.${base64Url(signature)}`;
if (token.length > 100) throw new Error('The review token exceeds the store credential limit.');

await mkdir(secretsDirectory, { recursive: true });
await writeFile(resolve(secretsDirectory, `review-license-${email.replace(/[^a-z0-9]+/g, '-')}.txt`), `${token}\n`, {
    encoding: 'utf8',
    mode: 0o600
});
console.log(token);
