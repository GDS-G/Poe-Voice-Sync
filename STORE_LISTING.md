# Poe Voice Sync Store Listing

## Name

Poe Voice Sync

## Short description

Hear Poe chatbot replies with ElevenLabs or Hume voices, automatic new-message playback, and per-message controls.

## Detailed description

Give every Poe response a voice.

Poe Voice Sync adds a voice button beside Poe chatbot responses and can automatically read newly received replies. Choose ElevenLabs or Hume, enter your own provider API key, and select from your available voices. Personalized voices appear before provider-library voices.

- ElevenLabs and Hume support
- Automatic playback for new chatbot replies
- No automatic playback of old messages when a page loads
- Per-message voice controls for current and earlier responses
- Personalized voices listed first
- One shared API-key field that remembers each provider separately
- Chrome, Edge, Firefox, Brave, and Vivaldi support

Poe Voice Sync is paid software with a three-day free trial and no ongoing free tier. Access after the trial is $9.99 USD per month or $99.99 USD per year. Voice-provider usage is billed separately by ElevenLabs or Hume under the user's own account.

Poe Voice Sync is not affiliated with Poe, ElevenLabs, or Hume.

## Support and feedback

Discord: https://discord.gg/YzWbrnyxus

Repository and documentation: https://github.com/GDS-G/Poe-Voice-Sync

Privacy policy: https://github.com/GDS-G/Poe-Voice-Sync/blob/main/PRIVACY.md

## Store image order

1. Real Poe conversation with the extension's voice buttons visible and the popup open to the provider/voice controls.
2. Real auto-read flow showing a newly completed chatbot reply.
3. Real provider switch showing ElevenLabs and Hume plus personalized voices first.
4. Branded 1280 × 800 feature overview from `store-assets/exports/`.
5. Support/subscription information without making checkout the lead image.

Use `promo-small-440x280.png` as the text-free small tile and `promo-marquee-1400x560.png` as the marquee tile. Do not use the payment page as the primary screenshot.

## Single purpose

Convert Poe chatbot response text into user-requested speech through the user's selected ElevenLabs or Hume account.

## Permission justifications

- `storage`: save license state, user preferences, selected voices, and device-local provider API keys.
- `identity` and `identity.email` (Chromium): bind a paid license to the signed-in Chrome or Edge profile when the browser supports profile identity. Firefox and other compatible Chromium browsers use an explicitly entered license email.
- `tabs`: notify open Poe tabs when speech or license settings change.
- `offscreen` (Chromium): play autoplay speech from a Manifest V3 service worker through an audio-only offscreen document.
- `poe.com` host access: detect Poe chatbot responses and add the user-facing speech button.
- ElevenLabs and Hume host access: list the user's available voices and generate requested speech.
- `gds-g.github.io` host access: open the hosted PayPal subscription page, receive a limited subscription reference after approval, and retrieve the signed automatic-license registry.

## Data disclosure

Before speech is enabled, the extension explains that text being read is sent directly to the selected voice provider and requires affirmative consent. Provider API keys remain in device-local extension storage. See `PRIVACY.md` for the full policy.

## Reviewer notes

Production builds reject beta licenses. Customer subscriptions activate automatically. Store reviewers can use the supplied temporary, email-bound reviewer token plus test API credentials without completing a real purchase. The extension contains no remotely hosted executable code; downloaded registry data is accepted only after local ECDSA signature verification.
