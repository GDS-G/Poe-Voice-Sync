# Poe Voice Sync Store Listing

## Name

Poe Voice Sync

## Short description

Read Poe chatbot responses aloud with your own ElevenLabs or Hume voices.

## Detailed description

Poe Voice Sync adds a speech button to Poe chatbot responses and can automatically read newly received responses. Choose ElevenLabs or Hume, enter your own provider API key, and select from your available voices. Personalized voices appear before provider-library voices.

The extension does not read existing conversation history automatically when a Poe page first loads. Manual speech buttons remain available for current and earlier chatbot responses.

Poe Voice Sync is paid software with no free production tier. Access is $9.99 USD per month or $99.99 USD per year. Voice-provider usage is billed separately by ElevenLabs or Hume under the user's own account.

## Single purpose

Convert Poe chatbot response text into user-requested speech through the user's selected ElevenLabs or Hume account.

## Permission justifications

- `storage`: save license state, user preferences, selected voices, and device-local provider API keys.
- `identity` and `identity.email` (Chromium): bind a paid license to the signed-in Chrome or Edge profile when the browser supports profile identity. Other compatible Chromium browsers use a manually entered license email.
- `tabs`: notify open Poe tabs when speech or license settings change.
- `offscreen` (Chromium): play autoplay speech from a Manifest V3 service worker through an audio-only offscreen document.
- `poe.com` host access: detect Poe chatbot responses and add the user-facing speech button.
- ElevenLabs and Hume host access: list the user's available voices and generate requested speech.
- `gds-g.github.io` host access: open the hosted PayPal subscription page and receive a limited subscription reference after approval.

## Data disclosure

Before speech is enabled, the extension explains that text being read is sent directly to the selected voice provider and requires affirmative consent. Provider API keys remain in device-local extension storage. See `PRIVACY.md` for the full policy.

## Reviewer notes

Production builds reject beta licenses. Review requires a temporary, email-bound production license token plus test API credentials for at least one supported provider. The extension contains no remotely hosted executable code.
