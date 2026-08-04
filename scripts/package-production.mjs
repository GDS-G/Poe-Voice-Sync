import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

const repositoryRoot = resolve('.');
const outputDirectory = resolve('dist');
if (relative(repositoryRoot, outputDirectory).startsWith(`..${sep}`) || outputDirectory === repositoryRoot) {
    throw new Error('Production output must remain inside the repository.');
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
    if (file === 'popup.html') {
        const popup = await readFile(resolve(file), 'utf8');
        await writeFile(destination, popup.replace(/\s*<script type="module" src="debug\.js"><\/script>/, ''), 'utf8');
    } else {
        await copyFile(resolve(file), destination);
    }
}
await writeFile(
    resolve(outputDirectory, 'license-config.js'),
    '// Production distribution: beta license generation and validation are disabled.\nexport const ALLOW_BETA_LICENSES = false;\n',
    'utf8'
);

console.log(`Production extension packaged at ${outputDirectory}`);
