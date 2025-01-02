import authHandler from './auth.js';
import licenseHandler from './license.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Get all DOM elements
    const form = document.getElementById('settings-form');
    const apiKeyInput = document.getElementById('api-key');
    const voiceSelection = document.getElementById('voice-selection');
    const volumeSlider = document.getElementById('volume');
    const volumeLabel = document.querySelector('.volume-label');
    const enableSpeechCheckbox = document.getElementById('enable-speech');
    const testButton = document.getElementById('test-tts');
    const statusElement = document.getElementById('test-status');

    // Auth elements
    const signInContent = document.getElementById('sign-in-content');
    const signedInContent = document.getElementById('signed-in-content');
    const signInButton = document.getElementById('sign-in-button');
    const signOutButton = document.getElementById('sign-out-button');
    const userEmailSpan = document.getElementById('user-email');
    const licenseSection = document.getElementById('license-section');
    const licensedContent = document.getElementById('licensed-content');
    const unlicensedContent = document.getElementById('unlicensed-content');
    const purchaseButton = document.getElementById('purchase-button');
    const loadingIndicator = document.getElementById('loading-indicator');

    // Initial UI update
    await updateAuthUI();

    // Listen for license updates
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'LICENSE_UPDATED') {
            updateAuthUI();
        }
    });

    // Auth event listeners
    signInButton.addEventListener('click', async () => {
        loadingIndicator.style.display = 'block';
        try {
            const result = await authHandler.signIn();
            if (result.success) {
                await updateAuthUI();
            } else {
                showStatus('Sign in failed: ' + result.error, 'error');
            }
        } finally {
            loadingIndicator.style.display = 'none';
        }
    });

    signOutButton.addEventListener('click', async () => {
        loadingIndicator.style.display = 'block';
        try {
            const result = await authHandler.signOut();
            if (result.success) {
                await updateAuthUI();
            } else {
                showStatus('Sign out failed: ' + result.error, 'error');
            }
        } finally {
            loadingIndicator.style.display = 'none';
        }
    });

    // Purchase button listener
    purchaseButton.addEventListener('click', () => {
        const width = 500;
        const height = 600;
        const left = (screen.width - width) / 2;
        const top = (screen.height - height) / 2;

        window.open(
            'https://gds-g.github.io/Poe-Voice-Sync/payment/payment.html',
            'POE Voice Sync Payment',
            `width=${width},height=${height},left=${left},top=${top}`
        );
    });

    // Handle payment completion message
    window.addEventListener('message', async (event) => {
        if (event.origin !== 'https://gds-g.github.io') return;

        if (event.data.type === 'PAYMENT_COMPLETE') {
            loadingIndicator.style.display = 'block';
            try {
                const authState = await authHandler.getAuthState();
                if (!authState.isAuthenticated) {
                    throw new Error('User must be signed in to activate license');
                }

                // Generate and store license
                const licenseResult = await licenseHandler.generateLicenseKey(authState.userEmail);
                if (!licenseResult.success) {
                    throw new Error('Failed to generate license');
                }

                // Show licensed content immediately
                signInContent.style.display = 'none';
                signedInContent.style.display = 'block';
                licensedContent.style.display = 'block';
                unlicensedContent.style.display = 'none';
                form.style.display = 'block';

                // Load initial settings
                await loadInitialSettings();

                // Notify background script
                await chrome.runtime.sendMessage({
                    type: 'PAYMENT_COMPLETE',
                    orderId: event.data.orderId,
                    transactionId: event.data.transactionId,
                    licenseKey: licenseResult.licenseKey
                });

                showStatus('License activated successfully!', 'success');

                // Force UI refresh
                await updateAuthUI();
            } catch (error) {
                console.error('License activation error:', error);
                showStatus('License activation failed: ' + error.message, 'error');
            } finally {
                loadingIndicator.style.display = 'none';
            }
        }
    });

    async function loadInitialSettings() {
        const settings = await chrome.storage.sync.get(['apiKey', 'voice', 'volume', 'enabled']);

        if (settings.apiKey) {
            apiKeyInput.value = settings.apiKey;
            await fetchVoices(settings.apiKey);
        }

        if (settings.voice) {
            setTimeout(() => {
                voiceSelection.value = settings.voice;
                if (voiceSelection.selectedIndex === -1) {
                    voiceSelection.selectedIndex = 0;
                    chrome.storage.sync.set({ voice: voiceSelection.value });
                }
            }, 500);
        }

        if (settings.volume !== undefined) {
            volumeSlider.value = settings.volume;
            updateVolumeLabel();
        } else {
            volumeSlider.value = 0.7;
            updateVolumeLabel();
        }

        if (settings.enabled !== undefined) {
            enableSpeechCheckbox.checked = settings.enabled;
        } else {
            enableSpeechCheckbox.checked = true;
        }
    }

    async function updateAuthUI() {
        loadingIndicator.style.display = 'block';
        try {
            const authState = await authHandler.getAuthState();

            if (authState.isAuthenticated) {
                signInContent.style.display = 'none';
                signedInContent.style.display = 'block';
                userEmailSpan.textContent = authState.userEmail;
                licenseSection.style.display = 'block';

                const verification = await licenseHandler.verifyLicenseForEmail(authState.userEmail);
                if (verification.success && verification.isValid) {
                    licensedContent.style.display = 'block';
                    unlicensedContent.style.display = 'none';
                    form.style.display = 'block';
                    await loadInitialSettings();
                } else {
                    licensedContent.style.display = 'none';
                    unlicensedContent.style.display = 'block';
                    form.style.display = 'none';
                }
            } else {
                signInContent.style.display = 'block';
                signedInContent.style.display = 'none';
                licenseSection.style.display = 'none';
                form.style.display = 'none';
            }
        } finally {
            loadingIndicator.style.display = 'none';
        }
    }

    function showStatus(message, type = 'success') {
        const statusDiv = document.getElementById('status-message');
        statusDiv.textContent = message;
        statusDiv.className = `status-message ${type}`;
        statusDiv.style.display = 'block';
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }

    function updateVolumeLabel() {
        const value = Math.round(volumeSlider.value * 100);
        volumeLabel.textContent = `${value}%`;
    }

    async function saveSettings() {
        const settings = {
            apiKey: apiKeyInput.value.trim(),
            voice: voiceSelection.value,
            volume: parseFloat(volumeSlider.value),
            enabled: enableSpeechCheckbox.checked
        };

        await chrome.storage.sync.set(settings);

        // Notify all tabs about the settings change
        const tabs = await chrome.tabs.query({ url: "*://*.poe.com/*" });
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                type: 'SETTINGS_UPDATED',
                settings: settings
            }).catch(() => {
                // Ignore errors for inactive tabs
            });
        });

        showStatus('Settings saved!', 'success');
    }

    // Event listeners
    volumeSlider.addEventListener('input', () => {
        updateVolumeLabel();
        saveSettings();
    });

    enableSpeechCheckbox.addEventListener('change', saveSettings);
    voiceSelection.addEventListener('change', saveSettings);

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

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveSettings();
    });

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

    apiKeyInput.addEventListener('change', () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            fetchVoices(apiKey);
        }
        saveSettings();
    });
});