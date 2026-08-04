import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

const repositoryRoot = resolve('.');
const betaBundle = process.argv.includes('--beta');
const outputDirectory = resolve(betaBundle ? 'dist-beta' : 'dist');
if (relative(repositoryRoot, outputDirectory).startsWith(`..${sep}`) || outputDirectory === repositoryRoot) {
    throw new Error('Extension output must remain inside the repository.');
}

const runtimeFiles = [
    'auth.js',
    'background.js',
    'content.js',
    'license.js',
    'license-token.js',
    'license-public-key.js',
    'manifest.json',
    'popup.css',
    'popup.html',
    'popup.js',
    'tts.js',
    'tts-bridge.js',
    'icons/icon16.png',
    'icons/icon32.png',
    'icons/icon48.png',
    'icons/icon128.png',
    'icons/logo.png',
    'icons/SignOut.png'
];

await rm(outputDirectory, { recursive: true, force: true });
for (const file of runtimeFiles) {
    const destination = resolve(outputDirectory, file);
    await mkdir(dirname(destination), { recursive: true });
    if (file === 'manifest.json' && betaBundle) {
        const manifest = JSON.parse(await readFile(resolve(file), 'utf8'));
        manifest.browser_specific_settings.gecko.strict_min_version = '121.0';
        delete manifest.browser_specific_settings.gecko.data_collection_permissions;
        delete manifest.browser_specific_settings.gecko_android;
        await writeFile(destination, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    } else if (file === 'popup.html') {
        const popup = await readFile(resolve(file), 'utf8');
        await writeFile(destination, popup.replace(/\s*<script type="module" src="debug\.js"><\/script>/, ''), 'utf8');
    } else {
        await copyFile(resolve(file), destination);
    }
}
await writeFile(
    resolve(outputDirectory, 'license-config.js'),
    betaBundle
        ? '// Local beta distribution: beta license validation is enabled.\nexport const ALLOW_BETA_LICENSES = true;\n'
        : '// Production distribution: beta license generation and validation are disabled.\nexport const ALLOW_BETA_LICENSES = false;\n',
    'utf8'
);

console.log(`${betaBundle ? 'Beta' : 'Production'} extension packaged at ${outputDirectory}`);
