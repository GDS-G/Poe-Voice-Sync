import { webcrypto } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const force = process.argv.includes('--force');
const secretsDirectory = resolve(process.env.PVS_SECRETS_DIR || '../Poe-Voice-Sync-Secrets');
const privateKeyPath = resolve(secretsDirectory, 'poe-voice-sync-automatic-private-key.pem');
const publicKeyModulePath = resolve('automatic-license-public-key.js');

if (!force) {
    try {
        await access(privateKeyPath);
        throw new Error(`An automatic issuer key already exists at ${privateKeyPath}. Use --force only for an intentional key rotation.`);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}

const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
);
const privatePkcs8 = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', keyPair.privateKey));
const publicJwk = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
const privatePem = [
    '-----BEGIN PRIVATE KEY-----',
    ...privatePkcs8.toString('base64').match(/.{1,64}/g),
    '-----END PRIVATE KEY-----',
    ''
].join('\n');

await mkdir(secretsDirectory, { recursive: true });
await writeFile(privateKeyPath, privatePem, { encoding: 'utf8', mode: 0o600 });
await writeFile(
    publicKeyModulePath,
    `// Public key for the automatic subscription registry. The private key is stored only in GitHub Actions secrets.\nexport default Object.freeze(${JSON.stringify(publicJwk, null, 4)});\n`,
    'utf8'
);

console.log(`Created automatic issuer private key: ${privateKeyPath}`);
console.log(`Created automatic issuer public key: ${publicKeyModulePath}`);
