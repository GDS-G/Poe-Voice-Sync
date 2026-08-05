import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

const repositoryRoot = resolve('.');
const betaBundle = process.argv.includes('--beta');
const browserArgument = process.argv.find(argument => argument.startsWith('--browser='))?.split('=')[1] || 'all';
const browsers = browserArgument === 'all' ? ['chromium', 'firefox'] : [browserArgument];
if (!browsers.every(browser => ['chromium', 'firefox'].includes(browser))) {
    throw new Error('Use --browser=chromium, --browser=firefox, or --browser=all.');
}

const sharedRuntimeFiles = [
    'auth.js',
    'automatic-license-public-key.js',
    'background.js',
    'content.js',
    'license.js',
    'license-token.js',
    'license-public-key.js',
    'payment-bridge.js',
    'popup.css',
    'popup.html',
    'popup.js',
    'subscription-config.js',
    'tts.js',
    'tts-bridge.js',
    'icons/icon16.png',
    'icons/icon32.png',
    'icons/icon48.png',
    'icons/icon128.png',
    'icons/logo.png',
    'icons/SignOut.png'
];

for (const browser of browsers) {
    const outputDirectory = resolve(betaBundle ? 'dist-beta' : 'dist', browser);
    if (relative(repositoryRoot, outputDirectory).startsWith(`..${sep}`) || outputDirectory === repositoryRoot) {
        throw new Error('Extension output must remain inside the repository.');
    }
    const runtimeFiles = browser === 'chromium'
        ? [...sharedRuntimeFiles, 'offscreen.html', 'offscreen.js']
        : sharedRuntimeFiles;
    const manifestSource = browser === 'chromium' ? 'manifest.json' : 'manifests/manifest.firefox.json';

    await rm(outputDirectory, { recursive: true, force: true });
    for (const file of runtimeFiles) {
        const destination = resolve(outputDirectory, file);
        await mkdir(dirname(destination), { recursive: true });
        if (file === 'popup.html') {
            const popup = await readFile(resolve(file), 'utf8');
            await writeFile(destination, popup.replace(/\s*<script type="module" src="debug\.js"><\/script>/, ''), 'utf8');
        } else {
            await copyFile(resolve(file), destination);
        }
    }
    await copyFile(resolve(manifestSource), resolve(outputDirectory, 'manifest.json'));
    await writeFile(
        resolve(outputDirectory, 'license-config.js'),
        betaBundle
            ? '// Local beta distribution: beta license validation is enabled.\nexport const ALLOW_BETA_LICENSES = true;\n'
            : '// Production distribution: beta license generation and validation are disabled.\nexport const ALLOW_BETA_LICENSES = false;\n',
        'utf8'
    );
    console.log(`${betaBundle ? 'Beta' : 'Production'} ${browser} extension packaged at ${outputDirectory}`);
}
