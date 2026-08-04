import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('Firefox build uses signed-license email identity without OAuth tokens', async () => {
    const [authSource, popupSource, manifestSource] = await Promise.all([
        readFile(new URL('auth.js', root), 'utf8'),
        readFile(new URL('popup.html', root), 'utf8'),
        readFile(new URL('manifest.json', root), 'utf8')
    ]);
    const manifest = JSON.parse(manifestSource);

    assert.doesNotMatch(authSource, /identity\.getProfileUserInfo/);
    assert.doesNotMatch(authSource, /identity\.getAuthToken|removeCachedAuthToken/);
    assert.match(authSource, /emailInput\.trim\(\)\.toLowerCase\(\)/);
    assert.match(popupSource, /Continue with License Email/);
    assert.match(popupSource, /Activate Local Beta License/);
    assert.equal(manifest.oauth2, undefined);
    assert.deepEqual(manifest.permissions, ['storage', 'tabs']);
    assert.deepEqual(manifest.background.scripts, ['background.js']);
    assert.equal(manifest.browser_specific_settings.gecko.id, 'poe-voice-sync@gds-g.github.io');
    assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, '140.0');
    assert.equal(manifest.browser_specific_settings.gecko_android.strict_min_version, '142.0');
    assert.deepEqual(
        manifest.browser_specific_settings.gecko.data_collection_permissions.required,
        ['authenticationInfo', 'websiteContent']
    );
});
