// Debug logging helper
function debug(message) {
    console.log(`[DEBUG] ${message}`);
}

// Keep track of state
let currentAudio = null;
let currentButton = null;
let initialPageLoad = true;
let isPlaying = false;
let lastScrollPosition = window.scrollY;
let currentSettings = null;
const processedMessageIds = new Set();
const messageObservers = new Map();
const messageTimestamps = new Map();

// Function to get fresh settings
async function getSettings() {
    try {
        const settings = await chrome.storage.sync.get(['apiKey', 'voice', 'volume', 'enabled']);
        currentSettings = settings;
        return settings;
    } catch (error) {
        console.error('Error getting settings:', error);
        return null;
    }
}

// Add styles for the voice button
function injectStyles() {
    const styles = `
        .tts-button {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            min-width: 24px !important;
            width: 24px !important;
            min-height: 24px !important;
            height: 24px !important;
            padding: 4px !important;
            margin-left: 8px !important;
            background: transparent !important;
            border: none !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            opacity: 0.7 !important;
            transition: all 0.2s ease !important;
            vertical-align: middle !important;
            flex-shrink: 0 !important;
            position: relative !important;
        }

        .tts-button:hover {
            opacity: 1 !important;
            background: rgba(0, 0, 0, 0.05) !important;
        }

        .tts-button img {
            width: 16px !important;
            height: 16px !important;
            min-width: 16px !important;
            min-height: 16px !important;
            object-fit: contain !important;
        }

        .tts-button.playing {
            background: rgba(88, 101, 242, 0.1) !important;
            animation: tts-pulse 1s infinite;
        }

        .tts-error-tooltip {
            display: none;
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            background: #ff4444;
            color: white;
            padding: 8px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            z-index: 1000;
            margin-bottom: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        @keyframes tts-pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
        }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
    debug('Styles injected');
}

// Stop current audio if playing
function stopCurrentAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        if (currentButton) {
            currentButton.classList.remove('playing');
        }
        currentAudio = null;
        currentButton = null;
        isPlaying = false;
        debug('Audio stopped');
    }
}

// Show error message
function showError(button, message) {
    button.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
    setTimeout(() => button.style.backgroundColor = '', 2000);

    let tooltip = button.querySelector('.tts-error-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'tts-error-tooltip';
        button.appendChild(tooltip);
    }
    tooltip.textContent = message;
    tooltip.style.display = 'block';
    setTimeout(() => tooltip.style.display = 'none', 5000);
}

// Play message using TTS
async function playMessage(text, button) {
    if (!text) {
        debug('No text to play');
        return;
    }

    if (isPlaying) {
        debug('Already playing, stopping current audio');
        stopCurrentAudio();
    }

    // Get fresh settings before each playback
    const settings = await getSettings();
    if (!settings) {
        debug('Could not get settings');
        showError(button, 'Could not get settings');
        return;
    }

    if (!settings.apiKey) {
        debug('No API key found');
        showError(button, 'No API key set. Please set your ElevenLabs API key in the extension settings.');
        return;
    }

    debug('Starting playback');
    button.classList.add('playing');
    currentButton = button;
    isPlaying = true;

    try {
        debug('Making TTS request with text: ' + text.substring(0, 50) + '...');
        const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + (settings.voice || 'EXAVITQu4vr4xnSDxMaL'), {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': settings.apiKey
            },
            body: JSON.stringify({
                text: text,
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            })
        });

        if (!response.ok) {
            isPlaying = false;
            if (response.status === 429) {
                throw new Error('Rate limit exceeded. Please wait a moment before trying again.');
            } else {
                throw new Error(`TTS request failed: ${response.status}`);
            }
        }

        debug('Got response from TTS API');
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);

        const audio = new Audio(audioUrl);
        audio.volume = settings.volume || 0.7;

        currentAudio = audio;

        audio.onended = () => {
            debug('Playback ended successfully');
            URL.revokeObjectURL(audioUrl);
            button.classList.remove('playing');
            currentAudio = null;
            currentButton = null;
            isPlaying = false;
        };

        audio.onerror = (error) => {
            debug('Audio playback error: ' + error);
            URL.revokeObjectURL(audioUrl);
            button.classList.remove('playing');
            currentAudio = null;
            currentButton = null;
            isPlaying = false;
            showError(button, 'Error playing audio');
        };

        await audio.play();
        debug('Playback started successfully');

    } catch (error) {
        console.error('TTS error:', error);
        showError(button, error.message);
        button.classList.remove('playing');
        currentButton = null;
        isPlaying = false;
    }
}

// Add voice button to message
async function addVoiceButton(messageElement, isNewMessage = false) {
    // Find message content and verify it's a bot message using loose class selectors
    const messageBubble = messageElement.querySelector('[class*="Message_leftSideMessageBubble"]');
    const messageContent = messageBubble?.querySelector('[class*="Markdown_markdownContainer"]');

    if (!messageBubble || !messageContent || messageElement.querySelector('.tts-button')) {
        return;
    }

    // Get the message ID - first try data attribute, then fall back to alternatives
    const messageId = messageElement.getAttribute('data-message-id') ||
        messageElement.id ||
        `msg-${Date.now()}-${Math.random()}`;

    // Record timestamp for this message if it's new
    if (!messageTimestamps.has(messageId)) {
        messageTimestamps.set(messageId, Date.now());
    }

    // Check if this is truly a new message
    // A message is considered truly new if:
    // 1. We're not in initial page load
    // 2. It's marked as a new message
    // 3. We haven't processed it before
    // 4. It's not from scrolling
    // 5. It appeared within the last 5 seconds (helps filter out loaded messages)
    const messageTime = messageTimestamps.get(messageId);
    const isTrulyNew = !initialPageLoad &&
        isNewMessage &&
        !processedMessageIds.has(messageId) &&
        !isFromScroll(messageElement) &&
        messageTime > (Date.now() - 5000);

    // Track this message
    processedMessageIds.add(messageId);

    debug(`Adding voice button to message. Is truly new: ${isTrulyNew}`);

    // Get the actions row using loose class selector
    let actionsRow = messageElement.querySelector('[class*="Message_row"]');
    if (!actionsRow) {
        actionsRow = document.createElement('div');
        // Use a standard class name that matches Poe's pattern
        actionsRow.setAttribute('class', 'Message_row');
        // Important: Insert after the message bubble to maintain layout
        messageBubble.parentNode.insertBefore(actionsRow, messageBubble.nextSibling);
    }

    // Create button
    const button = document.createElement('button');
    button.className = 'tts-button';
    button.title = 'Read message aloud (click again to stop)';

    // Create icon
    const icon = document.createElement('img');
    icon.src = chrome.runtime.getURL('icons/icon48.png');
    icon.alt = 'Text to speech';
    button.appendChild(icon);

    // Add click handler
    button.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Toggle playback
        if (button === currentButton) {
            stopCurrentAudio();
        } else {
            const text = messageContent.textContent.trim();
            await playMessage(text, button);
        }
    });

    // Add button to actions row
    actionsRow.appendChild(button);

    // Remove any duplicate buttons after adding new one
    setTimeout(() => removeDuplicateButtons(messageElement), 100);

    // Auto-play only if it's truly a new message and auto-play is enabled
    const settings = await getSettings();
    if (isTrulyNew && settings?.enabled) {
        debug('Waiting for message to complete before auto-playing');
        observeMessageContent(messageElement, messageContent, async (finalText) => {
            if (!isPlaying && messageTimestamps.get(messageId) > Date.now() - 5000) {
                debug('Auto-playing completed message');
                await playMessage(finalText.trim(), button);
            }
        });
    }
}

// Update styles to ensure proper positioning
function injectStyles() {
    const styles = `
        .tts-button {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            min-width: 24px !important;
            width: 24px !important;
            min-height: 24px !important;
            height: 24px !important;
            padding: 4px !important;
            margin-left: 8px !important;
            background: transparent !important;
            border: none !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            opacity: 0.7 !important;
            transition: all 0.2s ease !important;
            vertical-align: middle !important;
            flex-shrink: 0 !important;
            position: relative !important;
            float: right !important;
        }

        .tts-button:hover {
            opacity: 1 !important;
            background: rgba(0, 0, 0, 0.05) !important;
        }

        .tts-button img {
            width: 16px !important;
            height: 16px !important;
            min-width: 16px !important;
            min-height: 16px !important;
            object-fit: contain !important;
        }

        .tts-button.playing {
            background: rgba(88, 101, 242, 0.1) !important;
            animation: tts-pulse 1s infinite;
        }

        .tts-error-tooltip {
            display: none;
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            background: #ff4444;
            color: white;
            padding: 8px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            z-index: 1000;
            margin-bottom: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        @keyframes tts-pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
        }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
    debug('Styles injected');
}

// Function to remove duplicate buttons
function removeDuplicateButtons(messageElement) {
    const buttons = messageElement.querySelectorAll('.tts-button');
    if (buttons.length > 1) {
        debug(`Found ${buttons.length} buttons in message, removing duplicates`);
        // Keep the first button, remove the rest
        for (let i = 1; i < buttons.length; i++) {
            buttons[i].remove();
        }
    }
}

// Check if a message is from scroll loading
function isFromScroll(messageElement) {
    const rect = messageElement.getBoundingClientRect();
    return rect.top < 0 || Math.abs(window.scrollY - lastScrollPosition) > 50;
}

// Function to observe message content for streaming
function observeMessageContent(messageElement, contentElement, onComplete) {
    let lastContent = contentElement.textContent;
    let unchanged = 0;
    let observerId;

    const checkContent = () => {
        const currentContent = contentElement.textContent;

        if (currentContent === lastContent) {
            unchanged++;
            if (unchanged >= 3) { // Message has remained unchanged for 3 checks
                debug('Message content stabilized');
                clearInterval(observerId);
                messageObservers.delete(messageElement);
                onComplete(currentContent);
            }
        } else {
            unchanged = 0;
            lastContent = currentContent;
        }
    };

    observerId = setInterval(checkContent, 500); // Check every 500ms
    messageObservers.set(messageElement, observerId);

    // Safety cleanup after 10 seconds
    setTimeout(() => {
        if (messageObservers.has(messageElement)) {
            clearInterval(messageObservers.get(messageElement));
            messageObservers.delete(messageElement);
            onComplete(contentElement.textContent);
        }
    }, 10000);
}

// Process all messages in the chat using loose class selector
function processMessages() {
    debug('Processing all messages');
    const messages = document.querySelectorAll('[class*="ChatMessage_chatMessage"]');
    messages.forEach(message => {
        // Only process bot messages (left side bubbles)
        if (message.querySelector('[class*="Message_leftSideMessageBubble"]')) {
            addVoiceButton(message, false);
        }
    });

    // After processing initial messages, mark page load as complete
    setTimeout(() => {
        initialPageLoad = false;
        debug('Initial page load complete');
        // Clean up any duplicate buttons after initial processing
        cleanupDuplicateButtons();
        // Store initial scroll position
        lastScrollPosition = window.scrollY;
    }, 1000);
}

// Observe chat for new messages
function observeChat() {
    debug('Setting up chat observer');

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            // Only process childList mutations
            if (mutation.type !== 'childList') return;

            // Process new nodes
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Check if the node is a message using loose class selector
                    if (node.classList && node.getAttribute('class')?.includes('ChatMessage_chatMessage')) {
                        debug('New message node detected directly');
                        addVoiceButton(node, true);
                    }

                    // Check for messages inside the added node using loose class selector
                    const messages = node.querySelectorAll('[class*="ChatMessage_chatMessage"]');
                    if (messages.length > 0) {
                        debug(`Found ${messages.length} nested messages`);
                        messages.forEach(message => {
                            addVoiceButton(message, true);
                        });
                    }
                }
            });

            // Check for message content loaded after container
            if (mutation.target) {
                const messageElement = mutation.target.closest('[class*="ChatMessage_chatMessage"]');
                if (messageElement && !messageElement.querySelector('.tts-button')) {
                    debug('Found message content loaded after container');
                    addVoiceButton(messageElement, true);
                }
            }
        });

        // Clean up any duplicate buttons after processing mutations
        setTimeout(cleanupDuplicateButtons, 100);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
    });

    // Process existing messages
    debug('Processing existing messages');
    processMessages();
}

// Clean up all duplicate buttons in the chat
function cleanupDuplicateButtons() {
    const messages = document.querySelectorAll('[class*="ChatMessage_chatMessage"]');
    messages.forEach(message => {
        removeDuplicateButtons(message);
    });
}

// Initialize extension
async function initialize() {
    debug('Initializing extension');
    injectStyles();
    await getSettings(); // Get initial settings
    observeChat();

    // Add ESC key handler
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            stopCurrentAudio();
        }
    });

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'SETTINGS_UPDATED') {
            debug('Settings updated, refreshing settings and stopping current audio');
            stopCurrentAudio();
            getSettings(); // Refresh settings
            sendResponse({ status: 'acknowledged' });
        }
        return true; // Keep message channel open
    });
}

// Listen for scroll events
window.addEventListener('scroll', () => {
    lastScrollPosition = window.scrollY;
});

// Handle navigation
window.addEventListener('popstate', () => {
    stopCurrentAudio();
    initialPageLoad = true;  // Reset page load state
    isPlaying = false;
    lastScrollPosition = window.scrollY;
    currentSettings = null; // Reset settings

    // Clean up any existing message observers
    for (let [_, observerId] of messageObservers) {
        clearInterval(observerId);
    }
    messageObservers.clear();
    messageTimestamps.clear();

    initialize();
});

// Cleanup on unload
window.addEventListener('unload', () => {
    // Stop any playing audio
    stopCurrentAudio();

    // Clean up all observers
    for (let [_, observerId] of messageObservers) {
        clearInterval(observerId);
    }
    messageObservers.clear();
    messageTimestamps.clear();
});

// Start once DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}