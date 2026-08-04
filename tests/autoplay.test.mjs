import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('automatic playback uses a Chromium offscreen audio document', async () => {
    const [manifestText, background, content, offscreen, packager] = await Promise.all([
        readFile(new URL('manifest.json', root), 'utf8'),
        readFile(new URL('background.js', root), 'utf8'),
        readFile(new URL('content.js', root), 'utf8'),
        readFile(new URL('offscreen.js', root), 'utf8'),
        readFile(new URL('scripts/package-production.mjs', root), 'utf8')
    ]);
    const manifest = JSON.parse(manifestText);

    assert.ok(manifest.permissions.includes('offscreen'));
    assert.match(background, /chrome\.offscreen\.createDocument/);
    assert.match(background, /request\.type === 'PLAY_SPEECH'/);
    assert.match(content, /backgroundPlayback: true/);
    assert.match(offscreen, /await audio\.play\(\)/);
    assert.match(packager, /'offscreen\.html'/);
    assert.match(packager, /'offscreen\.js'/);
});
