import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('one source tree defines compatible Chromium and Firefox packages', () => {
    const chromium = JSON.parse(readFileSync('manifest.json', 'utf8'));
    const firefox = JSON.parse(readFileSync('manifests/manifest.firefox.json', 'utf8'));
    assert.equal(chromium.version, firefox.version);
    assert.equal(chromium.background.service_worker, 'background.js');
    assert.deepEqual(firefox.background.scripts, ['background.js']);
    assert.ok(chromium.permissions.includes('offscreen'));
    assert.ok(!firefox.permissions.includes('offscreen'));
    assert.deepEqual(chromium.content_scripts, firefox.content_scripts);
    assert.equal(firefox.browser_specific_settings.gecko.id, 'poe-voice-sync@gds-g.github.io');
});
