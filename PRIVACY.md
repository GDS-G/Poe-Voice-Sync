# Poe Voice Sync Privacy Policy

Effective date: August 4, 2026

Poe Voice Sync reads Poe chatbot response text aloud using a voice provider selected by the user. Paid Poe Voice Sync access does not include an ElevenLabs or Hume account; users supply their own provider account and API key.

## Data the extension handles

- Poe chatbot response text chosen for speech, including automatically read new responses when that option is enabled.
- The user's selected voice provider, voice, volume, and autoplay preference.
- The user's ElevenLabs and/or Hume API key.
- The license email, signed license token, license status, and limited PayPal subscription or transaction reference metadata used to verify access.

## How data is used and shared

When the user requests speech, Poe Voice Sync sends only the text being read and the required voice settings directly from the browser to the selected provider's API: ElevenLabs or Hume. The selected provider receives the user's API key so it can authenticate the request. These transfers are necessary to provide speech generation and are governed by the selected provider's own terms and privacy policy.

Poe Voice Sync does not send Poe message text or provider API keys to the Poe Voice Sync developer, advertising networks, data brokers, or analytics services. It does not sell personal information or use it for advertising, credit decisions, or unrelated profiling.

PayPal handles subscription checkout on the hosted payment page. Poe Voice Sync stores only limited transaction or subscription reference metadata needed for license verification; it does not receive or store payment-card details.

## Storage and retention

Provider API keys are stored in the browser's device-local extension storage and are removed from browser sync storage when an older installation is upgraded. License identity and non-secret preferences may be stored in browser extension storage so settings and license state can be restored. Data remains until the user signs out, clears extension data, or removes the extension, subject to the browser's own storage behavior.

## User controls

Speech generation is disabled until the user accepts the in-product voice data disclosure. Users can disable automatic reading, choose either provider, replace or remove their API key, sign out, clear extension data, or uninstall the extension at any time.

## Security

Poe Voice Sync uses HTTPS for provider and payment communications, requests only the browser permissions required for its features, does not execute remotely hosted code, and uses signed, expiring production license tokens. No client-only extension can guarantee absolute security; users should protect and rotate provider API keys according to provider guidance.

## Changes and contact

Material changes to data practices will be disclosed in the extension and reflected in this policy. Questions can be submitted through the repository's GitHub issue tracker: https://github.com/GDS-G/Poe-Voice-Sync/issues
