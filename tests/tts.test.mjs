import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadTts() {
    const context = vm.createContext({ URLSearchParams, Blob, console, setTimeout, clearTimeout });
    vm.runInContext(readFileSync('tts.js', 'utf8'), context);
    return context.PoeVoiceTTS;
}

function response({ json, blob = new Blob(['audio']), ok = true, status = 200 }) {
    const value = {
        ok,
        status,
        headers: { get: () => null },
        async json() { return json; },
        async text() { return typeof json === 'string' ? json : JSON.stringify(json); },
        async blob() { return blob; }
    };
    value.clone = () => value;
    return value;
}

test('ElevenLabs voice listing and synthesis use the expected API contract', async () => {
    const tts = loadTts();
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        if (String(url).endsWith('/voices')) {
            return response({ json: { voices: [{ voice_id: 'voice-1', name: 'Voice One', category: 'cloned' }] } });
        }
        return response({ blob: new Blob(['mp3']) });
    };
    const voices = await tts.fetchVoices('elevenlabs', 'eleven-key', fetchImpl);
    assert.equal(voices[0].id, 'voice-1');
    assert.equal(voices[0].category, 'cloned');
    assert.equal(calls[0].options.headers['xi-api-key'], 'eleven-key');
    await tts.synthesize({ provider: 'elevenlabs', apiKey: 'eleven-key', voiceId: 'voice/1', text: 'Hello' }, fetchImpl);
    assert.match(calls[1].url, /voice%2F1/);
    assert.equal(JSON.parse(calls[1].options.body).model_id, 'eleven_multilingual_v2');
});

test('personalized voices sort before provider-library voices', () => {
    const tts = loadTts();
    const eleven = tts.orderVoices('elevenlabs', [
        { id: 'premade-z', name: 'Zara', category: 'premade' },
        { id: 'clone-z', name: 'Zed Personal', category: 'cloned' },
        { id: 'generated-a', name: 'Amy Personal', category: 'generated' },
        { id: 'premade-a', name: 'Adam', category: 'premade' }
    ]);
    assert.deepEqual(Array.from(eleven, voice => voice.id), ['generated-a', 'clone-z', 'premade-a', 'premade-z']);

    const hume = tts.orderVoices('hume', [
        { id: 'library-a', name: 'Adam', provider: 'HUME_AI' },
        { id: 'custom-z', name: 'Zed Personal', provider: 'CUSTOM_VOICE' },
        { id: 'custom-a', name: 'Amy Personal', provider: 'CUSTOM_VOICE' }
    ]);
    assert.deepEqual(Array.from(hume, voice => voice.id), ['custom-a', 'custom-z', 'library-a']);
});

test('Hume loads library and custom voices and synthesizes Octave 2 MP3', async () => {
    const tts = loadTts();
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        if (String(url).includes('/voices?')) {
            const provider = new URL(String(url)).searchParams.get('provider');
            return response({ json: {
                page_number: 0,
                total_pages: 1,
                voices_page: [{ id: `${provider}-id`, name: provider, provider }]
            } });
        }
        return response({ blob: new Blob(['mp3']) });
    };
    const voices = await tts.fetchVoices('hume', 'hume-key', fetchImpl);
    assert.deepEqual(new Set(voices.map(voice => voice.provider)), new Set(['HUME_AI', 'CUSTOM_VOICE']));
    assert.equal(calls[0].options.headers['X-Hume-Api-Key'], 'hume-key');
    await tts.synthesize({ provider: 'hume', apiKey: 'hume-key', voiceId: 'hume-voice', text: 'Hello' }, fetchImpl);
    const synthesis = calls.at(-1);
    const payload = JSON.parse(synthesis.options.body);
    assert.equal(synthesis.url, 'https://api.hume.ai/v0/tts/file');
    assert.equal(payload.version, '2');
    assert.equal(payload.utterances[0].voice.id, 'hume-voice');
    assert.equal(payload.format.type, 'mp3');
});
