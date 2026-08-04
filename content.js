(function initializePoeVoiceSync() {
    'use strict';

    if (globalThis.__poeVoiceSyncInitialized) return;
    globalThis.__poeVoiceSyncInitialized = true;

    const CONTENT_SELECTOR = [
        '[data-testid="message-content"]',
        '[data-testid*="message-markdown"]',
        '[class*="Markdown_markdownContainer"]',
        '[class*="Message_messageText"]',
        '[class*="messageText"]'
    ].join(',');
    const CONTAINER_SELECTOR = [
        '[data-message-id]',
        '[data-testid*="chat-message"]',
        '[data-testid*="message-bubble"]',
        '[class*="ChatMessage_chatMessage"]',
        '[class*="Message_messageRow"]',
        'article'
    ].join(',');
    const BASELINE_MUTE_MS = 2500;
    const SETTLE_MS = 2200;
    const MAX_STREAM_WAIT_MS = 120000;

    const state = {
        settings: null,
        licensed: false,
        currentAudio: null,
        currentButton: null,
        currentAudioUrl: null,
        offscreenPlayback: false,
        isSynthesizing: false,
        playbackGeneration: 0,
        observer: null,
        routeUrl: location.href,
        routeGeneration: 0,
        baselineMuted: true,
        baselineTimer: null,
        lastScrollAt: 0,
        lastPromptAt: 0,
        recordCounter: 0,
        records: new WeakMap(),
        seenMessageKeys: new Set(),
        autoPlayedKeys: new Set()
    };

    function log(...args) {
        console.debug('[Poe Voice Sync]', ...args);
    }

    function injectStyles() {
        if (document.getElementById('poe-voice-sync-styles')) return;
        const style = document.createElement('style');
        style.id = 'poe-voice-sync-styles';
        style.textContent = `
            .poe-voice-sync-controls {
                display: flex !important;
                justify-content: flex-end !important;
                align-items: center !important;
                width: 100% !important;
                min-height: 28px !important;
                margin-top: 4px !important;
                pointer-events: none !important;
            }
            .poe-voice-sync-button {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                box-sizing: border-box !important;
                width: 28px !important;
                height: 28px !important;
                padding: 5px !important;
                margin: 0 2px !important;
                border: 0 !important;
                border-radius: 6px !important;
                background: transparent !important;
                cursor: pointer !important;
                opacity: .72 !important;
                pointer-events: auto !important;
                position: relative !important;
                z-index: 1 !important;
            }
            .poe-voice-sync-button:hover,
            .poe-voice-sync-button:focus-visible {
                opacity: 1 !important;
                background: rgba(127, 127, 127, .14) !important;
            }
            .poe-voice-sync-button img {
                width: 18px !important;
                height: 18px !important;
                object-fit: contain !important;
                pointer-events: none !important;
            }
            .poe-voice-sync-button.playing {
                opacity: 1 !important;
                background: rgba(88, 101, 242, .18) !important;
                animation: poe-voice-sync-pulse 1s infinite;
            }
            .poe-voice-sync-error {
                position: absolute !important;
                right: 0 !important;
                bottom: calc(100% + 6px) !important;
                max-width: 280px !important;
                padding: 7px 9px !important;
                border-radius: 5px !important;
                background: #b42318 !important;
                color: white !important;
                font: 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
                white-space: normal !important;
                box-shadow: 0 2px 8px rgba(0,0,0,.25) !important;
                z-index: 2147483647 !important;
            }
            @keyframes poe-voice-sync-pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function stopCurrentAudio({ stopOffscreen = true } = {}) {
        state.playbackGeneration += 1;
        if (state.currentAudio) {
            state.currentAudio.pause();
            state.currentAudio.currentTime = 0;
        }
        if (state.currentAudioUrl) URL.revokeObjectURL(state.currentAudioUrl);
        if (state.offscreenPlayback && stopOffscreen) {
            chrome.runtime.sendMessage({ type: 'STOP_SPEECH' }).catch(error => log('Unable to stop automatic playback', error));
        }
        state.currentButton?.classList.remove('playing');
        state.currentAudio = null;
        state.currentButton = null;
        state.currentAudioUrl = null;
        state.offscreenPlayback = false;
        state.isSynthesizing = false;
    }

    function showError(button, message) {
        let tooltip = button.querySelector('.poe-voice-sync-error');
        if (!tooltip) {
            tooltip = document.createElement('span');
            tooltip.className = 'poe-voice-sync-error';
            tooltip.setAttribute('role', 'alert');
            button.appendChild(tooltip);
        }
        tooltip.textContent = message;
        setTimeout(() => tooltip.remove(), 6000);
    }

    async function refreshSettings() {
        const [stored, localSecrets] = await Promise.all([
            chrome.storage.sync.get(['ttsProvider', 'voice', 'volume', 'enabled', 'providerConsent']),
            chrome.storage.local.get(['apiKey'])
        ]);
        state.settings = {
            provider: PoeVoiceTTS.normalizeProvider(stored.ttsProvider),
            apiKey: localSecrets.apiKey || '',
            voiceId: stored.voice || '',
            volume: stored.volume ?? 0.7,
            enabled: stored.providerConsent === true && (stored.enabled ?? true),
            consented: stored.providerConsent === true
        };
        try {
            const license = await chrome.runtime.sendMessage({ type: 'GET_LICENSE_STATE' });
            state.licensed = Boolean(license?.isValid);
        } catch (error) {
            state.licensed = false;
            log('License state unavailable', error);
        }
        if (!state.licensed) {
            stopCurrentAudio();
            document.querySelectorAll('.poe-voice-sync-controls').forEach(control => control.remove());
        }
        return state.settings;
    }

    function getMessageText(content) {
        const clone = content.cloneNode(true);
        clone.querySelectorAll('.poe-voice-sync-controls,.poe-voice-sync-button,.poe-voice-sync-error,script,style').forEach(node => node.remove());
        return (clone.innerText || clone.textContent || '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
    }

    async function playMessage(text, button, { backgroundPlayback = false } = {}) {
        const settings = await refreshSettings();
        if (!state.licensed) {
            showError(button, 'An active Poe Voice Sync license is required.');
            return;
        }
        if (!settings.consented) {
            showError(button, 'Accept the voice data disclosure in Poe Voice Sync settings first.');
            return;
        }
        if (button === state.currentButton && (state.currentAudio || state.isSynthesizing)) {
            stopCurrentAudio();
            return;
        }
        stopCurrentAudio();
        const playbackGeneration = state.playbackGeneration;
        button.classList.add('playing');
        state.currentButton = button;
        state.isSynthesizing = true;
        try {
            if (backgroundPlayback) {
                const result = await chrome.runtime.sendMessage({ type: 'PLAY_SPEECH', text });
                if (!result?.success) throw new Error(result?.error || 'Automatic audio playback failed.');
                if (playbackGeneration !== state.playbackGeneration || state.currentButton !== button) return;
                state.isSynthesizing = false;
                state.offscreenPlayback = true;
                return;
            }
            const blob = await PoeVoiceTTS.synthesize({ ...settings, text });
            if (playbackGeneration !== state.playbackGeneration || state.currentButton !== button) return;
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            audio.volume = Number(settings.volume ?? 0.7);
            state.currentAudio = audio;
            state.currentAudioUrl = audioUrl;
            state.isSynthesizing = false;
            const cleanup = () => {
                if (state.currentAudio === audio) stopCurrentAudio();
                else URL.revokeObjectURL(audioUrl);
            };
            audio.addEventListener('ended', cleanup, { once: true });
            audio.addEventListener('error', cleanup, { once: true });
            await audio.play();
        } catch (error) {
            if (playbackGeneration !== state.playbackGeneration || state.currentButton !== button) return;
            console.error('[Poe Voice Sync] TTS failed', error);
            showError(button, error.message);
            if (state.currentButton === button) stopCurrentAudio();
        }
    }

    function signatureFor(element) {
        const parts = [];
        let current = element;
        for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
            for (const attr of ['class', 'id', 'data-testid', 'data-author', 'data-message-author', 'data-role', 'aria-label']) {
                const value = current.getAttribute?.(attr);
                if (value) parts.push(`${attr}=${value}`);
            }
        }
        return parts.join(' ').toLowerCase();
    }

    function getMessageContainer(content) {
        if (content.matches(CONTAINER_SELECTOR)) return content;
        return content.closest(CONTAINER_SELECTOR) || content.parentElement;
    }

    function isAssistantMessage(container, content) {
        if (!container || !content) return false;
        const signature = signatureFor(container);
        if (/rightside|humanmessage|user-message|message-user|author=user|message-author=user|data-role=user/.test(signature)) return false;
        if (/leftside|bot-message|assistant-message|chatbot|author=assistant|message-author=assistant|data-role=assistant/.test(signature)) return true;
        if (container.querySelector('[class*="Message_leftSideMessageBubble"],[data-testid*="bot-message"],[data-testid*="assistant-message"]')) return true;
        return content.matches('[class*="Markdown_markdownContainer"],[data-testid="message-content"],[data-testid*="message-markdown"]');
    }

    function messageKey(container) {
        let current = container;
        for (let depth = 0; current && depth < 4; depth += 1, current = current.parentElement) {
            for (const attr of ['data-message-id', 'data-id', 'data-chat-message-id']) {
                const value = current.getAttribute?.(attr);
                if (value) return `${state.routeUrl}::${value}`;
            }
            if (current.id && /message/i.test(current.id)) return `${state.routeUrl}::${current.id}`;
        }
        state.recordCounter += 1;
        return `${state.routeUrl}::dom-${state.recordCounter}`;
    }

    function hasFollowingAssistantMessage(container) {
        let sibling = container.nextElementSibling;
        while (sibling) {
            const content = sibling.matches?.(CONTENT_SELECTOR) ? sibling : sibling.querySelector?.(CONTENT_SELECTOR);
            if (content && isAssistantMessage(getMessageContainer(content), content)) return true;
            sibling = sibling.nextElementSibling;
        }
        return false;
    }

    function isLikelyNewResponse(container) {
        const recentlyPrompted = Date.now() - state.lastPromptAt < 120000;
        const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - Math.max(700, window.innerHeight);
        const notScrollLoading = Date.now() - state.lastScrollAt > 1500;
        return !hasFollowingAssistantMessage(container) && (recentlyPrompted || (nearBottom && notScrollLoading));
    }

    function isGenerationInProgress() {
        return Boolean(document.querySelector([
            'button[aria-label*="Stop generating" i]',
            'button[title*="Stop generating" i]',
            '[data-testid*="stop-generating"]'
        ].join(',')));
    }

    function scheduleAutoRead(record) {
        if (!record.autoCandidate || record.autoPlayed) return;
        clearTimeout(record.settleTimer);
        record.settleTimer = setTimeout(async () => {
            if (!record.container.isConnected || state.baselineMuted || record.routeGeneration !== state.routeGeneration) return;
            const text = getMessageText(record.content);
            if (!text) {
                scheduleAutoRead(record);
                return;
            }
            if (isGenerationInProgress() && Date.now() - record.createdAt < MAX_STREAM_WAIT_MS) {
                scheduleAutoRead(record);
                return;
            }
            if (text !== record.lastText) {
                record.lastText = text;
                scheduleAutoRead(record);
                return;
            }
            await refreshSettings();
            if (!state.settings?.enabled || !state.licensed) return;
            record.autoPlayed = true;
            state.autoPlayedKeys.add(record.key);
            await playMessage(getMessageText(record.content), record.button, { backgroundPlayback: true });
        }, SETTLE_MS);
    }

    function attachControls(record) {
        if (record.controls?.isConnected) return;
        const controls = document.createElement('span');
        controls.className = 'poe-voice-sync-controls';
        controls.dataset.poeVoiceSync = 'controls';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'poe-voice-sync-button';
        button.title = 'Read this chatbot response aloud (click again to stop)';
        button.setAttribute('aria-label', 'Read chatbot response aloud');
        const icon = document.createElement('img');
        icon.src = chrome.runtime.getURL('icons/icon48.png');
        icon.alt = '';
        button.appendChild(icon);
        controls.appendChild(button);
        record.content.insertAdjacentElement('afterend', controls);
        record.controls = controls;
        record.button = button;
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            playMessage(getMessageText(record.content), button);
        });
    }

    function ensureMessage(content, mutationMayBeNew) {
        const container = getMessageContainer(content);
        if (!isAssistantMessage(container, content)) return;
        let record = state.records.get(container);
        if (record) {
            if (!record.content.isConnected) record.content = content;
            if (state.licensed) attachControls(record);
            scheduleAutoRead(record);
            return;
        }

        const key = messageKey(container);
        const alreadySeen = state.seenMessageKeys.has(key);
        const autoCandidate = Boolean(
            state.licensed && mutationMayBeNew && !state.baselineMuted && !alreadySeen &&
            !state.autoPlayedKeys.has(key) && isLikelyNewResponse(container)
        );
        state.seenMessageKeys.add(key);
        record = {
            key,
            container,
            content,
            controls: null,
            button: null,
            autoCandidate,
            autoPlayed: false,
            lastText: getMessageText(content),
            createdAt: Date.now(),
            routeGeneration: state.routeGeneration,
            settleTimer: null
        };
        state.records.set(container, record);
        if (state.licensed) attachControls(record);
        scheduleAutoRead(record);
    }

    function scan(root, mutationMayBeNew) {
        if (!root || root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
        const contents = [];
        if (root.nodeType === Node.ELEMENT_NODE && root.matches(CONTENT_SELECTOR)) contents.push(root);
        contents.push(...root.querySelectorAll(CONTENT_SELECTOR));
        const uniqueContainers = new Set();
        for (const content of contents) {
            const container = getMessageContainer(content);
            if (!container || uniqueContainers.has(container)) continue;
            uniqueContainers.add(container);
            ensureMessage(content, mutationMayBeNew);
        }
    }

    function markPromptActivity(event) {
        if (event.type === 'keydown') {
            const editable = event.target.matches?.('textarea,input,[contenteditable="true"]');
            if (event.key === 'Enter' && !event.shiftKey && editable) state.lastPromptAt = Date.now();
            return;
        }
        const button = event.target.closest?.('button');
        const label = `${button?.getAttribute('aria-label') || ''} ${button?.title || ''} ${button?.textContent || ''}`;
        if (button && /send|submit|regenerate|retry/i.test(label)) state.lastPromptAt = Date.now();
    }

    function beginRouteBaseline() {
        state.routeUrl = location.href;
        state.routeGeneration += 1;
        state.baselineMuted = true;
        state.lastPromptAt = 0;
        stopCurrentAudio();
        clearTimeout(state.baselineTimer);
        scan(document, false);
        state.baselineTimer = setTimeout(() => {
            scan(document, false);
            state.baselineMuted = false;
            log('Startup/navigation baseline established; auto-read armed for new responses.');
        }, BASELINE_MUTE_MS);
    }

    async function start() {
        injectStyles();
        await refreshSettings();
        scan(document, false);
        state.observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) scan(node, true);
                    });
                }
                const content = mutation.target.nodeType === Node.ELEMENT_NODE
                    ? mutation.target.closest?.(CONTENT_SELECTOR)
                    : mutation.target.parentElement?.closest?.(CONTENT_SELECTOR);
                if (content) ensureMessage(content, true);
            }
        });
        state.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        beginRouteBaseline();

        window.addEventListener('scroll', () => { state.lastScrollAt = Date.now(); }, { passive: true });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') stopCurrentAudio();
            markPromptActivity(event);
        }, true);
        document.addEventListener('click', markPromptActivity, true);
        window.addEventListener('popstate', beginRouteBaseline);
        setInterval(() => {
            if (location.href !== state.routeUrl) beginRouteBaseline();
        }, 500);

        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
            if (message.type === 'OFFSCREEN_PLAYBACK_FINISHED') {
                if (state.offscreenPlayback) {
                    if (message.error && state.currentButton) showError(state.currentButton, message.error);
                    stopCurrentAudio({ stopOffscreen: false });
                }
                return false;
            }
            if (message.type !== 'SETTINGS_UPDATED' && message.type !== 'LICENSE_UPDATED') return false;
            refreshSettings().then(() => {
                stopCurrentAudio();
                scan(document, false);
                sendResponse({ status: 'acknowledged' });
            });
            return true;
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
