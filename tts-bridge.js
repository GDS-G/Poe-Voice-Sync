(function installBackgroundTtsBridge(globalScope) {
    'use strict';
    const providerApi = globalScope.PoeVoiceTTS;
    globalScope.PoeVoiceTTS = Object.freeze({
        ...providerApi,
        async synthesize(options) {
            const result = await chrome.runtime.sendMessage({
                type: 'SYNTHESIZE_SPEECH',
                text: options.text
            });
            if (!result?.success) throw new Error(result?.error || 'Speech synthesis failed.');
            const binary = atob(result.audioBase64);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
            return new Blob([bytes], { type: result.mimeType || 'audio/mpeg' });
        }
    });
})(globalThis);
