import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('provider API keys are migrated out of browser sync storage', async () => {
    const [popupSource, backgroundSource, contentSource] = await Promise.all([
        readFile(new URL('popup.js', root), 'utf8'),
        readFile(new URL('background.js', root), 'utf8'),
        readFile(new URL('content.js', root), 'utf8')
    ]);

    assert.match(popupSource, /chrome\.storage\.local\.get\(\['apiKey', 'apiKeys'\]\)/);
    assert.match(popupSource, /chrome\.storage\.local\.set\(localSecrets\)/);
    assert.match(popupSource, /chrome\.storage\.sync\.remove\(\['apiKey', 'apiKeys'\]\)/);
    assert.doesNotMatch(popupSource, /chrome\.storage\.sync\.set\(settings\)/);
    assert.match(backgroundSource, /chrome\.storage\.local\.get\(\['apiKey'\]\)/);
    assert.match(contentSource, /chrome\.storage\.local\.get\(\['apiKey'\]\)/);
});
