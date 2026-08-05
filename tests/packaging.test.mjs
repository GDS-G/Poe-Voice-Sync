import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
    assert.equal(firefox.browser_specific_settings.gecko_android, undefined);
});

test('Firefox store archive uses portable ZIP entry paths', () => {
    const build = spawnSync(process.execPath, ['scripts/package-production.mjs', '--browser=firefox'], {
        encoding: 'utf8'
    });
    assert.equal(build.status, 0, build.stderr || build.stdout);

    const archive = readFileSync('dist/releases/Poe-Voice-Sync-Firefox-1.2.1.zip');
    const names = [];
    let offset = 0;
    while (archive.readUInt32LE(offset) === 0x04034b50) {
        const compressedSize = archive.readUInt32LE(offset + 18);
        const nameLength = archive.readUInt16LE(offset + 26);
        const extraLength = archive.readUInt16LE(offset + 28);
        names.push(archive.subarray(offset + 30, offset + 30 + nameLength).toString('utf8'));
        offset += 30 + nameLength + extraLength + compressedSize;
    }

    assert.ok(names.includes('icons/icon128.png'));
    assert.ok(names.every(name => !name.includes('\\')), `Invalid ZIP entry path: ${names.find(name => name.includes('\\'))}`);
});
