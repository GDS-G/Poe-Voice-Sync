(function (globalScope) {
    'use strict';
    const PROVIDERS = Object.freeze({
        elevenlabs: Object.freeze({ id: 'elevenlabs', label: 'ElevenLabs', apiKeyUrl: 'https://elevenlabs.io/app/settings/api-keys', apiKeyPlaceholder: 'Enter your ElevenLabs API key' }),
        hume: Object.freeze({ id: 'hume', label: 'Hume', apiKeyUrl: 'https://platform.hume.ai/settings/keys', apiKeyPlaceholder: 'Enter your Hume API key' })
    });
    const normalizeProvider = provider => provider === 'hume' ? 'hume' : 'elevenlabs';
    const getProviderInfo = provider => PROVIDERS[normalizeProvider(provider)];
    const ELEVENLABS_PERSONAL_CATEGORIES = new Set(['cloned', 'generated', 'professional']);

    function isPersonalizedVoice(provider, voice) {
        const normalized = normalizeProvider(provider);
        if (normalized === 'hume') return voice.provider === 'CUSTOM_VOICE';
        return ELEVENLABS_PERSONAL_CATEGORIES.has(String(voice.category || '').toLowerCase());
    }

    function orderVoices(provider, voices) {
        const normalized = normalizeProvider(provider);
        return [...voices].sort((left, right) => {
            const personalDifference = Number(isPersonalizedVoice(normalized, right)) - Number(isPersonalizedVoice(normalized, left));
            if (personalDifference) return personalDifference;
            return String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' });
        });
    }

    async function apiError(response, label) {
        let detail = '';
        try {
            const payload = await response.clone().json();
            detail = payload?.detail?.message || payload?.detail || payload?.message || payload?.error || '';
            if (typeof detail !== 'string') detail = JSON.stringify(detail);
        } catch (_) {
            try { detail = (await response.text()).trim(); } catch (_) { detail = ''; }
        }
        const requestId = response.headers?.get?.('x-request-id');
        const suffix = [detail, requestId ? `Request ID: ${requestId}` : ''].filter(Boolean).join(' ');
        return new Error(`${label} request failed (${response.status})${suffix ? `: ${suffix}` : ''}`);
    }
    async function requireSuccess(response, label) {
        if (!response.ok) throw await apiError(response, label);
        return response;
    }
    async function elevenVoices(apiKey, fetchImpl) {
        const response = await fetchImpl('https://api.elevenlabs.io/v1/voices', { headers: { Accept: 'application/json', 'xi-api-key': apiKey } });
        await requireSuccess(response, 'ElevenLabs');
        const data = await response.json();
        return (data.voices || []).map(voice => ({
            id: voice.voice_id,
            name: voice.name,
            provider: 'ELEVENLABS',
            category: voice.category || ''
        }));
    }
    async function humeProviderVoices(apiKey, voiceProvider, fetchImpl) {
        const voices = [];
        let pageNumber = 0;
        let totalPages = 1;
        do {
            const query = new URLSearchParams({ provider: voiceProvider, page_number: String(pageNumber), page_size: '100', ascending_order: 'true' });
            const response = await fetchImpl(`https://api.hume.ai/v0/tts/voices?${query}`, { headers: { Accept: 'application/json', 'X-Hume-Api-Key': apiKey } });
            await requireSuccess(response, 'Hume');
            const page = await response.json();
            voices.push(...(page.voices_page || []));
            totalPages = Math.max(1, Number(page.total_pages) || 1);
            pageNumber += 1;
        } while (pageNumber < totalPages);
        return voices.map(voice => ({ id: voice.id, name: voice.name, provider: voice.provider || voiceProvider }));
    }
    async function humeVoices(apiKey, fetchImpl) {
        const results = await Promise.allSettled([
            humeProviderVoices(apiKey, 'HUME_AI', fetchImpl),
            humeProviderVoices(apiKey, 'CUSTOM_VOICE', fetchImpl)
        ]);
        const voices = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
        if (!voices.length) throw results.find(result => result.status === 'rejected')?.reason || new Error('Hume returned no voices.');
        return voices;
    }
    async function fetchVoices(provider, apiKey, fetchImpl = globalScope.fetch.bind(globalScope)) {
        const normalized = normalizeProvider(provider);
        if (!apiKey?.trim()) throw new Error(`${getProviderInfo(normalized).label} API key is required.`);
        return normalized === 'hume' ? humeVoices(apiKey.trim(), fetchImpl) : elevenVoices(apiKey.trim(), fetchImpl);
    }
    async function synthesize(options, fetchImpl = globalScope.fetch.bind(globalScope)) {
        const provider = normalizeProvider(options.provider);
        const apiKey = options.apiKey?.trim();
        const voiceId = options.voiceId?.trim();
        const text = options.text?.trim();
        if (!apiKey) throw new Error(`${getProviderInfo(provider).label} API key is required.`);
        if (!voiceId) throw new Error('Select a voice first.');
        if (!text) throw new Error('There is no message text to read.');
        const isHume = provider === 'hume';
        const url = isHume
            ? 'https://api.hume.ai/v0/tts/file'
            : `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
        const headers = isHume
            ? { Accept: 'audio/mpeg', 'Content-Type': 'application/json', 'X-Hume-Api-Key': apiKey }
            : { Accept: 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': apiKey };
        const body = isHume
            ? { version: '2', utterances: [{ text, voice: { id: voiceId } }], format: { type: 'mp3' }, num_generations: 1, strip_headers: false }
            : { text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } };
        const response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body) });
        await requireSuccess(response, isHume ? 'Hume' : 'ElevenLabs');
        return response.blob();
    }
    globalScope.PoeVoiceTTS = Object.freeze({
        PROVIDERS,
        normalizeProvider,
        getProviderInfo,
        isPersonalizedVoice,
        orderVoices,
        fetchVoices,
        synthesize
    });
})(globalThis);
