import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';

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

const crcTable = Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    return crc >>> 0;
});

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
    return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
    const year = Math.max(1980, date.getUTCFullYear());
    return {
        date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
        time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2)
    };
}

async function collectFiles(root, directory = root) {
    const files = [];
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const absolutePath = resolve(directory, entry.name);
        if (entry.isDirectory()) files.push(...await collectFiles(root, absolutePath));
        else if (entry.isFile()) files.push({
            absolutePath,
            // ZIP entry names always use forward slashes, including on Windows.
            archivePath: relative(root, absolutePath).split(sep).join('/')
        });
    }
    return files;
}

async function createZip(sourceDirectory, archivePath) {
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    const modified = dosDateTime(new Date(Date.UTC(2000, 0, 1)));

    for (const file of await collectFiles(sourceDirectory)) {
        const contents = await readFile(file.absolutePath);
        const compressed = deflateRawSync(contents, { level: 9 });
        const fileName = Buffer.from(file.archivePath, 'utf8');
        const checksum = crc32(contents);
        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt16LE(0x0800, 6);
        localHeader.writeUInt16LE(8, 8);
        localHeader.writeUInt16LE(modified.time, 10);
        localHeader.writeUInt16LE(modified.date, 12);
        localHeader.writeUInt32LE(checksum, 14);
        localHeader.writeUInt32LE(compressed.length, 18);
        localHeader.writeUInt32LE(contents.length, 22);
        localHeader.writeUInt16LE(fileName.length, 26);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(0x0314, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt16LE(0x0800, 8);
        centralHeader.writeUInt16LE(8, 10);
        centralHeader.writeUInt16LE(modified.time, 12);
        centralHeader.writeUInt16LE(modified.date, 14);
        centralHeader.writeUInt32LE(checksum, 16);
        centralHeader.writeUInt32LE(compressed.length, 20);
        centralHeader.writeUInt32LE(contents.length, 24);
        centralHeader.writeUInt16LE(fileName.length, 28);
        centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
        centralHeader.writeUInt32LE(localOffset, 42);

        localParts.push(localHeader, fileName, compressed);
        centralParts.push(centralHeader, fileName);
        localOffset += localHeader.length + fileName.length + compressed.length;
    }

    const centralDirectory = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(centralParts.length / 2, 8);
    end.writeUInt16LE(centralParts.length / 2, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(localOffset, 16);

    await mkdir(dirname(archivePath), { recursive: true });
    await writeFile(archivePath, Buffer.concat([...localParts, centralDirectory, end]));
}

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
    const manifest = JSON.parse(await readFile(resolve(outputDirectory, 'manifest.json'), 'utf8'));
    const browserName = browser === 'chromium' ? 'Chromium' : 'Firefox';
    const archiveName = `Poe-Voice-Sync-${browserName}-${manifest.version}${betaBundle ? '-beta' : ''}.zip`;
    const archivePath = resolve(betaBundle ? 'dist-beta' : 'dist', 'releases', archiveName);
    await createZip(outputDirectory, archivePath);
    console.log(`${betaBundle ? 'Beta' : 'Production'} ${browser} extension packaged at ${outputDirectory}`);
    console.log(`Store archive created at ${archivePath}`);
}
