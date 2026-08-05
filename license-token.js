const TOKEN_PREFIX = 'PVS1';
const REVIEW_TOKEN_PREFIX = 'PVR1';
const AUTOMATIC_TOKEN_PREFIX = 'PVA1';
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

export async function hashLicensedEmail(email) {
    const bytes = new TextEncoder().encode(normalizeLicensedEmail(email));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyLicenseToken(token, expectedEmail, publicKeyJwk, nowMs = Date.now()) {
    try {
        const normalizedToken = String(token || '').trim();
        const [prefix, encodedPayload, encodedSignature, extra] = normalizedToken.split('.');
        const key = await crypto.subtle.importKey(
            'jwk',
            publicKeyJwk,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify']
        );

        if (prefix === REVIEW_TOKEN_PREFIX) {
            if (!encodedPayload || !encodedSignature || extra) {
                throw new Error('The review license token format is invalid.');
            }
            const normalizedEmail = normalizeLicensedEmail(expectedEmail);
            const expiresAt = Number.parseInt(encodedPayload, 36);
            const nowSeconds = Math.floor(nowMs / 1000);
            if (!normalizedEmail || !Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds) {
                throw new Error('The review license has expired or is invalid.');
            }
            const signingInput = new TextEncoder().encode(`${prefix}.${normalizedEmail}.${encodedPayload}`);
            const isAuthentic = await crypto.subtle.verify(
                { name: 'ECDSA', hash: 'SHA-256' },
                key,
                base64UrlToBytes(encodedSignature),
                signingInput
            );
            if (!isAuthentic) throw new Error('The review license signature is invalid.');
            return {
                success: true,
                payload: {
                    version: 1,
                    product: PRODUCT_ID,
                    email: normalizedEmail,
                    plan: 'store-review',
                    issuedAt: nowSeconds,
                    expiresAt,
                    transactionHash: 'store-review'
                }
            };
        }

        if (![TOKEN_PREFIX, AUTOMATIC_TOKEN_PREFIX].includes(prefix) || !encodedPayload || !encodedSignature || extra) {
            throw new Error('The license token format is invalid.');
        }
        const signingInput = new TextEncoder().encode(`${prefix}.${encodedPayload}`);
        const isAuthentic = await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            key,
            base64UrlToBytes(encodedSignature),
            signingInput
        );
        if (!isAuthentic) throw new Error('The license signature is invalid.');

        const payload = decodePayload(encodedPayload);
        const expectedVersion = prefix === AUTOMATIC_TOKEN_PREFIX ? 2 : 1;
        if (payload.version !== expectedVersion || payload.product !== PRODUCT_ID) {
            throw new Error('The license is not valid for Poe Voice Sync.');
        }
        if (prefix === AUTOMATIC_TOKEN_PREFIX) {
            if (payload.emailHash !== await hashLicensedEmail(expectedEmail)) {
                throw new Error('The subscription belongs to a different signed-in email address.');
            }
        } else if (normalizeLicensedEmail(payload.email) !== normalizeLicensedEmail(expectedEmail)) {
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
        const hasBinding = prefix === AUTOMATIC_TOKEN_PREFIX
            ? payload.subscriptionHash
            : payload.transactionHash && payload.nonce;
        if (!hasBinding || !payload.plan) {
            throw new Error('The license payload is incomplete.');
        }
        return { success: true, payload };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export const LICENSE_TOKEN_PRODUCT = PRODUCT_ID;
export const LICENSE_TOKEN_PREFIX = TOKEN_PREFIX;
export const REVIEW_LICENSE_TOKEN_PREFIX = REVIEW_TOKEN_PREFIX;
export const AUTOMATIC_LICENSE_TOKEN_PREFIX = AUTOMATIC_TOKEN_PREFIX;
