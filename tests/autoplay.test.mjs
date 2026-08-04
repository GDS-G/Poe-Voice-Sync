import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('automatic playback uses the Firefox background document', async () => {
    const [manifestText, background, content, packager] = await Promise.all([
        readFile(new URL('manifest.json', root), 'utf8'),
        readFile(new URL('background.js', root), 'utf8'),
        readFile(new URL('content.js', root), 'utf8'),
        readFile(new URL('scripts/package-production.mjs', root), 'utf8')
    ]);
    const manifest = JSON.parse(manifestText);

    assert.equal(manifest.permissions.includes('offscreen'), false);
    assert.deepEqual(manifest.background.scripts, ['background.js']);
    assert.doesNotMatch(background, /chrome\.offscreen/);
    assert.match(background, /request\.type === 'PLAY_SPEECH'/);
    assert.match(background, /backgroundAudio = new Audio/);
    assert.match(content, /backgroundPlayback: true/);
    assert.doesNotMatch(packager, /'offscreen\.html'/);
    assert.doesNotMatch(packager, /'offscreen\.js'/);
});
