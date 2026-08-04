import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const requiredFiles = [
    ...(manifest.background.scripts || []),
    manifest.action.default_popup,
    'license-token.js',
    'license-public-key.js',
    'license-config.js',
    'payment/payment.html',
    'payment/payment-config.js',
    'payment/app.js',
    'payment/logo.png',
    ...manifest.content_scripts.flatMap(script => script.js)
];
for (const file of requiredFiles) {
    if (!existsSync(file)) throw new Error(`Manifest references missing file: ${file}`);
}
for (const permission of ['https://api.elevenlabs.io/*', 'https://api.hume.ai/*']) {
    if (!manifest.host_permissions.includes(permission)) throw new Error(`Host permission is missing: ${permission}`);
}
const scripts = manifest.content_scripts[0].js;
const expectedOrder = ['tts.js', 'tts-bridge.js', 'content.js'];
if (!expectedOrder.every((file, index) => scripts[index] === file)) {
    throw new Error(`Content scripts must load in this order: ${expectedOrder.join(', ')}`);
}

for (const file of ['app.js', 'auth.js', 'background.js', 'content.js', 'debug.js', 'license.js', 'license-token.js', 'license-public-key.js', 'license-config.js', 'payment/app.js', 'payment/payment-config.js', 'popup.js', 'tts.js', 'tts-bridge.js']) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`${file} failed syntax validation:\n${result.stderr}`);
}
console.log(`Poe Voice Sync ${manifest.version} extension bundle validated.`);
