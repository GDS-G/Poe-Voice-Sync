# Poe Voice Sync

Cross-browser extension that reads Poe chatbot responses aloud with either ElevenLabs or Hume voices.

## Local beta installation

1. Run `npm run package:beta` to create clean, secret-free `dist-beta/chromium/` and `dist-beta/firefox/` bundles.
2. Open `chrome://extensions` in Google Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select `dist-beta/chromium/`. Never load the repository root; browser testing should use only the allowlisted bundle.
5. Pin **Poe Voice Sync**, sign in, and configure a provider, API key, and voice.

## Chrome and Microsoft Edge

The Chromium release uses the signed-in Chrome or Microsoft Edge browser profile for explicit account verification. Users click **Sign in with Chrome or Edge** in the extension popup. Signing out of Poe Voice Sync clears only the extension session; it does not sign the browser profile out. The same package is supported in current Chrome and Edge releases.

The provider menu uses one API-key field while remembering separate ElevenLabs and Hume keys. Personalized voices appear first: ElevenLabs cloned/generated/professional voices are grouped above premade voices, and Hume custom voices are grouped above the shared Hume Voice Library.

## Playback behavior

- Every detected Poe chatbot response receives an extension-owned voice button.
- Existing messages are never auto-read during initial page load or SPA chat navigation.
- New responses wait for streamed text to stabilize, then auto-read once when enabled.
- Clicking a message's voice button always reads that message's current full text.
- Escape or clicking the active voice button stops playback.

## Validation

```text
npm run build
npm test
```

The build validates the Manifest V3 bundle, required permissions/files, and JavaScript syntax. Tests cover the ElevenLabs and Hume API request contracts, personalized-voice ordering, persistent license deactivation/reactivation, and signed production-license validation.

## Automatic production licensing without a paid server

Normal customer activation is automatic. Checkout creates a PayPal subscription whose custom field contains a one-way hash of the license email. A scheduled GitHub Actions workflow uses the PayPal REST API to independently confirm active subscriptions and publishes a privacy-safe registry of short-lived ECDSA P-256 signed entitlements to GitHub Pages. The extension contains only the public verification key and never receives the PayPal client secret or signing private key. The PayPal page itself never unlocks paid features.

The workflow runs every five minutes and removes canceled, suspended, failed, or outstanding subscriptions from the next registry. Signed entitlements expire after 72 hours, limiting offline grace if a subscription stops being active. New subscriptions normally activate within about 10 minutes; reviewer/support tokens remain available for store testing and exceptional recovery.

Configure these GitHub Actions repository secrets before releasing the automatic build:

- `PAYPAL_CLIENT_ID`: the Poe Voice Sync live PayPal app client ID.
- `PAYPAL_CLIENT_SECRET`: the matching live PayPal app secret.
- `PVS_AUTOMATIC_LICENSE_PRIVATE_KEY`: the complete contents of `../Poe-Voice-Sync-Secrets/poe-voice-sync-automatic-private-key.pem`.

The automatic key pair is created once with `npm run license:setup-automatic`. Never commit or distribute the private key. The workflow definition is `.github/workflows/sync-paypal-licenses.yml`, and its only published customer artifact is `payment/licenses.json`, containing email hashes and signed tokens—not raw emails, PayPal names, credentials, or subscription IDs.

## Manual reviewer and support fallback

Production licenses use ECDSA P-256 signatures. By default, the private signing key and issuance ledger stay in the sibling `../Poe-Voice-Sync-Secrets/` directory, outside the extension source tree; set `PVS_SECRETS_DIR` to use another protected location. The extension contains only the public verification key. A buyer cannot generate or modify a production license, and each license is bound to the buyer's signed-in email and an expiration date.

The initial key pair has already been generated for this workspace. To create a new installation from scratch, run this exactly once:

```text
npm run license:setup
```

For store review or exceptional support recovery, issue a time-limited license locally after independently confirming access:

```text
npm run license:issue -- --email buyer@example.com --transaction PAYPAL_REFERENCE --plan monthly --days 31
```

Alternatively, use `--expires YYYY-MM-DD` instead of `--days`. The issuer refuses to reuse a PayPal transaction reference and records issuance in the external secrets directory's `license-ledger.json` file. The signed token can be entered under **Reviewer or support license** in the popup. This is not the normal customer fulfillment path.

The hosted payment page uses the dedicated Poe Voice Sync Live PayPal app and the two active production subscription plans. Both plans include a three-day free trial. After the trial, the selected prices are **$9.99 USD monthly** and **$99.99 USD yearly**. The yearly plan saves $19.89 (about 17%, equivalent to roughly two months free) compared with twelve monthly payments. There is no ongoing production free tier: the customer distribution rejects beta licenses and requires a valid paid, signed license after the trial. Canonical hosted-page sources live in `payment/`.

## Production extension package

Do not distribute the repository root, which intentionally keeps beta testing controls enabled. Build the customer package with:

```text
npm run package:production
```

The generated ignored `dist/chromium/` and `dist/firefox/` directories share the same application source and differ only where browser manifests or background audio capabilities require it. Both omit the debug module and disable beta license generation. Chrome, Edge, Brave, and Vivaldi use the Chromium package; Firefox uses the Firefox package. Release work should remain on `main` with short-lived feature branches rather than long-lived browser branches.
