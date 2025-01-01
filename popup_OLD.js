document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('settings-form');
    const apiKeyInput = document.getElementById('api-key');
    const voiceSelection = document.getElementById('voice-selection');
    const volumeSlider = document.getElementById('volume');
    const volumeLabel = document.querySelector('.volume-label');
    const enableSpeechCheckbox = document.getElementById('enable-speech');
    const testButton = document.getElementById('test-tts');
    const statusElement = document.getElementById('test-status');

    // Load saved settings
    chrome.storage.sync.get(['apiKey', 'voice', 'volume', 'enabled'], async (data) => {
        debug('Loading saved settings:', data);
        
        // Set API key and fetch voices
        if (data.apiKey) {
            apiKeyInput.value = data.apiKey;
            await fetchVoices(data.apiKey);
        }

        // Set voice after voices are loaded
        if (data.voice) {
            setTimeout(() => {
                voiceSelection.value = data.voice;
                if (voiceSelection.selectedIndex === -1) {
                    // If voice not found, select first available
                    voiceSelection.selectedIndex = 0;
                    // Save the new selection
                    chrome.storage.sync.set({ voice: voiceSelection.value });
                }
            }, 500);
        }

        // Set volume
        if (data.volume !== undefined) {
            volumeSlider.value = data.volume;
        } else {
            volumeSlider.value = 0.7; // Default volume
        }
        updateVolumeLabel();

        // Set auto-play
        if (data.enabled !== undefined) {
            enableSpeechCheckbox.checked = data.enabled;
        } else {
            enableSpeechCheckbox.checked = true; // Default enabled
        }

        // Save initial settings if not set
        if (!data.apiKey || data.volume === undefined || data.enabled === undefined) {
            saveSettings();
        }
    });

    function debug(message, data) {
        console.log(`[POE Voice] ${message}`, data || '');
    }

    // Update volume label
    function updateVolumeLabel() {
        const value = Math.round(volumeSlider.value * 100);
        volumeLabel.textContent = `${value}%`;
    }

    // Save all settings
    function saveSettings() {
        const settings = {
            apiKey: apiKeyInput.value.trim(),
            voice: voiceSelection.value,
            volume: parseFloat(volumeSlider.value),
            enabled: enableSpeechCheckbox.checked
        };

        debug('Saving settings:', settings);
        
        chrome.storage.sync.set(settings, () => {
            const status = document.createElement('div');
            status.textContent = 'Settings saved!';
            status.style.cssText = 'color: green; margin-top: 10px; text-align: center;';
            form.appendChild(status);
            setTimeout(() => status.remove(), 2000);
        });
    }

    // Event listeners
    volumeSlider.addEventListener('input', () => {
        updateVolumeLabel();
        saveSettings();
    });

    enableSpeechCheckbox.addEventListener('change', saveSettings);
    voiceSelection.addEventListener('change', saveSettings);

    // Test voice button handler
    testButton.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            alert('Please enter an API key first');
            return;
        }

        testButton.disabled = true;
        const testStatus = document.createElement('span');
        testStatus.textContent = ' Testing...';
        testButton.parentNode.appendChild(testStatus);

        try {
            const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceSelection.value, {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': apiKey
                },
                body: JSON.stringify({
                    text: 'This is a test of the voice settings.',
                    model_id: 'eleven_multilingual_v2',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75
                    }
                })
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const blob = await response.blob();
            const audio = new Audio(URL.createObjectURL(blob));
            audio.volume = volumeSlider.value;
            await audio.play();
            testStatus.textContent = ' Test successful!';
            
        } catch (error) {
            console.error('Test failed:', error);
            testStatus.textContent = ' Test failed: ' + error.message;
        } finally {
            testButton.disabled = false;
            setTimeout(() => testStatus.remove(), 3000);
        }
    });

    // Form submit handler
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveSettings();
    });

    // Fetch available voices
    async function fetchVoices(apiKey) {
        try {
            const response = await fetch('https://api.elevenlabs.io/v1/voices', {
                headers: {
                    'Accept': 'application/json',
                    'xi-api-key': apiKey
                }
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            
            voiceSelection.innerHTML = '';
            data.voices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.voice_id;
                option.textContent = voice.name;
                voiceSelection.appendChild(option);
            });

            // Restore saved voice selection
            chrome.storage.sync.get(['voice'], (data) => {
                if (data.voice) {
                    voiceSelection.value = data.voice;
                }
            });

        } catch (error) {
            console.error('Error fetching voices:', error);
            voiceSelection.innerHTML = '<option value="">Error loading voices</option>';
        }
    }

    // Handle API key changes
    apiKeyInput.addEventListener('change', () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            fetchVoices(apiKey);
        }
        saveSettings();
    });
});