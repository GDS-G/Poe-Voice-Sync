const TOKEN_PREFIX = 'PVS1';
const PRODUCT_ID = 'poe-voice-sync';

function base64UrlToBytes(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(padded);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function decodePayload(encodedPayload) {
    const json = new TextDecoder().decode(base64UrlToBytes(encodedPayload));
    return JSON.parse(json);
}

export function normalizeLicensedEmail(email) {
    return String(email || '').trim().toLowerCase();
}

export async function verifyLicenseToken(token, expectedEmail, publicKeyJwk, nowMs = Date.now()) {
    try {
        const [prefix, encodedPayload, encodedSignature, extra] = String(token || '').trim().split('.');
        if (prefix !== TOKEN_PREFIX || !encodedPayload || !encodedSignature || extra) {
            throw new Error('The license token format is invalid.');
        }
        const key = await crypto.subtle.importKey(
            'jwk',
            publicKeyJwk,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify']
        );
        const signingInput = new TextEncoder().encode(`${prefix}.${encodedPayload}`);
        const isAuthentic = await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            key,
            base64UrlToBytes(encodedSignature),
            signingInput
        );
        if (!isAuthentic) throw new Error('The license signature is invalid.');

        const payload = decodePayload(encodedPayload);
        if (payload.version !== 1 || payload.product !== PRODUCT_ID) {
            throw new Error('The license is not valid for Poe Voice Sync.');
        }
        if (normalizeLicensedEmail(payload.email) !== normalizeLicensedEmail(expectedEmail)) {
            throw new Error('The license belongs to a different signed-in email address.');
        }
        const issuedAt = Number(payload.issuedAt);
        const expiresAt = Number(payload.expiresAt);
        const nowSeconds = Math.floor(nowMs / 1000);
        if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) || expiresAt <= issuedAt) {
            throw new Error('The license dates are invalid.');
        }
        if (issuedAt > nowSeconds + 300) throw new Error('The license issue date is invalid.');
        if (expiresAt <= nowSeconds) throw new Error('The license has expired.');
        if (!payload.transactionHash || !payload.plan || !payload.nonce) {
            throw new Error('The license payload is incomplete.');
        }
        return { success: true, payload };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export const LICENSE_TOKEN_PRODUCT = PRODUCT_ID;
export const LICENSE_TOKEN_PREFIX = TOKEN_PREFIX;
