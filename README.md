# Poe Voice Sync

Chrome extension that reads Poe chatbot responses aloud with either ElevenLabs or Hume voices.

## Local beta installation

1. Run `npm run package:beta` to create a clean, secret-free `dist-beta/` bundle.
2. Open `chrome://extensions` in Google Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the generated `dist-beta/` directory. Never load the repository root; browser testing should use only the allowlisted bundle.
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

## No-cost manual production licensing

Production licenses use ECDSA P-256 signatures. By default, the private signing key and issuance ledger stay in the sibling `../Poe-Voice-Sync-Secrets/` directory, outside the extension source tree; set `PVS_SECRETS_DIR` to use another protected location. The extension contains only the public verification key. A buyer cannot generate or modify a production license, and each license is bound to the buyer's signed-in email and an expiration date.

The initial key pair has already been generated for this workspace. To create a new installation from scratch, run this exactly once:

```text
npm run license:setup
```

After independently confirming the payment or active subscription in the PayPal business dashboard, issue a time-limited license locally:

```text
npm run license:issue -- --email buyer@example.com --transaction PAYPAL_REFERENCE --plan monthly --days 31
```

Alternatively, use `--expires YYYY-MM-DD` instead of `--days`. The issuer refuses to reuse a PayPal transaction reference and records issuance in the external secrets directory's `license-ledger.json` file. Send the printed `PVS1...` token to the buyer, who enters it in the extension popup. Back up the private key and ledger securely; losing the private key prevents issuing compatible renewals, while exposing it allows forged licenses.

The hosted payment page records an unverified receipt but never activates production access. Until a no-cost or paid verification service is deployed, the merchant must verify each PayPal payment manually before issuing a signed token. A future server can replace this manual issuer without changing the signed token format or extension verification path.

The hosted payment page uses the dedicated Poe Voice Sync Live PayPal app and the two active production subscription plans. Both plans include a three-day free trial. After the trial, the selected prices are **$9.99 USD monthly** and **$99.99 USD yearly**. The yearly plan saves $19.89 (about 17%, equivalent to roughly two months free) compared with twelve monthly payments. There is no ongoing production free tier: the customer distribution rejects beta licenses and requires a valid paid, signed license after the trial. Canonical hosted-page sources live in `payment/`.

## Production extension package

Do not distribute the repository root, which intentionally keeps beta testing controls enabled. Build the customer package with:

```text
npm run package:production
```

The generated ignored `dist/` directory omits the debug module, removes it from the popup, and disables beta license generation and validation. Customer builds therefore require an authentic offline-signed production token.
