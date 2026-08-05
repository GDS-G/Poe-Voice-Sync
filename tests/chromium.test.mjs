import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('Chromium build uses profile identity with a manual fallback for compatible browsers', async () => {
    const [authSource, popupSource, manifestSource] = await Promise.all([
        readFile(new URL('auth.js', root), 'utf8'),
        readFile(new URL('popup.html', root), 'utf8'),
        readFile(new URL('manifest.json', root), 'utf8')
    ]);
    const manifest = JSON.parse(manifestSource);

    assert.match(authSource, /identity\.getProfileUserInfo/);
    assert.match(authSource, /emailInput\.trim\(\)\.toLowerCase\(\) \|\| profileEmail/);
    assert.doesNotMatch(authSource, /identity\.getAuthToken|removeCachedAuthToken/);
    assert.match(popupSource, /id="sign-in-email"/);
    assert.match(popupSource, /Firefox and other Chromium browsers use this license email/);
    assert.match(popupSource, /Activate Local Beta License/);
    assert.equal(manifest.oauth2, undefined);
    assert.equal(manifest.permissions.includes('identity'), true);
    assert.equal(manifest.permissions.includes('identity.email'), true);
    assert.equal(manifest.host_permissions.includes('https://accounts.google.com/*'), false);
});
