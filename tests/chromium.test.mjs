import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('Vivaldi build uses signed-license email identity without OAuth tokens', async () => {
    const [authSource, popupSource, manifestSource] = await Promise.all([
        readFile(new URL('auth.js', root), 'utf8'),
        readFile(new URL('popup.html', root), 'utf8'),
        readFile(new URL('manifest.json', root), 'utf8')
    ]);
    const manifest = JSON.parse(manifestSource);

    assert.doesNotMatch(authSource, /identity\.getProfileUserInfo/);
    assert.doesNotMatch(authSource, /identity\.getAuthToken|removeCachedAuthToken/);
    assert.match(popupSource, /Continue with License Email/);
    assert.match(popupSource, /id="sign-in-email"/);
    assert.match(popupSource, /Activate Local Beta License/);
    assert.equal(manifest.oauth2, undefined);
    assert.equal(manifest.permissions.includes('identity'), false);
    assert.equal(manifest.permissions.includes('identity.email'), false);
    assert.equal(manifest.host_permissions.includes('https://accounts.google.com/*'), false);
});
