(function initializeOffscreenAudio() {
    'use strict';

    let currentAudio = null;
    let currentAudioUrl = null;

    function decodeAudio(audioBase64, mimeType) {
        const binary = atob(audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return new Blob([bytes], { type: mimeType || 'audio/mpeg' });
    }

    function stopAudio() {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        }
        if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
        currentAudio = null;
        currentAudioUrl = null;
    }

    async function notifyFinished(error = '') {
        try {
            await chrome.runtime.sendMessage({ type: 'OFFSCREEN_PLAYBACK_FINISHED', error });
        } catch (_) { /* The service worker may be restarting; cleanup still succeeds. */ }
    }

    async function playAudio(request) {
        stopAudio();
        const blob = decodeAudio(request.audioBase64, request.mimeType);
        currentAudioUrl = URL.createObjectURL(blob);
        const audio = new Audio(currentAudioUrl);
        audio.volume = Math.min(1, Math.max(0, Number(request.volume ?? 0.7)));
        currentAudio = audio;
        audio.addEventListener('ended', () => {
            if (currentAudio !== audio) return;
            stopAudio();
            notifyFinished();
        }, { once: true });
        audio.addEventListener('error', () => {
            if (currentAudio !== audio) return;
            const message = audio.error?.message || 'Automatic audio playback failed.';
            stopAudio();
            notifyFinished(message);
        }, { once: true });
        await audio.play();
        return { success: true };
    }

    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        if (request.target !== 'offscreen') return false;
        if (request.type === 'OFFSCREEN_PLAY_AUDIO') {
            playAudio(request).then(sendResponse).catch(error => {
                stopAudio();
                notifyFinished(error.message);
                sendResponse({ success: false, error: error.message });
            });
            return true;
        }
        if (request.type === 'OFFSCREEN_STOP_AUDIO') {
            stopAudio();
            sendResponse({ success: true });
            return false;
        }
        return false;
    });
})();
