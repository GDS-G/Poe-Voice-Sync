import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('speech generation requires an explicit provider data disclosure consent', async () => {
    const [popupHtml, popupSource, backgroundSource, contentSource] = await Promise.all([
        readFile(new URL('popup.html', root), 'utf8'),
        readFile(new URL('popup.js', root), 'utf8'),
        readFile(new URL('background.js', root), 'utf8'),
        readFile(new URL('content.js', root), 'utf8')
    ]);

    assert.match(popupHtml, /Voice data disclosure/);
    assert.match(popupHtml, /id="provider-consent"/);
    assert.match(popupHtml, /text being read is sent directly from this browser/);
    assert.match(popupSource, /providerConsent: providerConsentCheckbox\.checked/);
    assert.match(backgroundSource, /settings\.providerConsent !== true/);
    assert.match(contentSource, /stored\.providerConsent === true/);
});
