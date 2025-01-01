import authHandler from './auth.js';
import licenseHandler from './license.js';

document.addEventListener('DOMContentLoaded', async () => {
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

    // Check initial auth state
    await updateAuthUI();

    // Listen for license updates from background script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'LICENSE_UPDATED') {
            updateAuthUI();
        }
    });

    // Auth event listeners
    signInButton.addEventListener('click', async () => {
        const result = await authHandler.signIn();
        if (result.success) {
            await updateAuthUI();
        } else {
            showStatus('Sign in failed: ' + result.error, 'error');
        }
    });

    signOutButton.addEventListener('click', async () => {
        const result = await authHandler.signOut();
        if (result.success) {
            await updateAuthUI();
        } else {
            showStatus('Sign out failed: ' + result.error, 'error');
        }
    });

    // Purchase button listener - Updated to use GitHub Pages
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

    // Add message listener to handle payment completion from GitHub Pages
    window.addEventListener('message', async (event) => {
        // Verify message origin
        if (event.origin !== 'https://gds-g.github.io') return;

        if (event.data.type === 'PAYMENT_COMPLETE') {
            try {
                // Notify background script to activate license
                await chrome.runtime.sendMessage({
                    type: 'PAYMENT_COMPLETE',
                    orderId: event.data.orderId,
                    transactionId: event.data.transactionId
                });

                // Update UI to show licensed state
                await updateAuthUI();
            } catch (error) {
                console.error('License activation error:', error);
                showStatus('License activation failed. Please contact support.', 'error');
            }
        }
    });

    async function updateAuthUI() {
        const authState = await authHandler.getAuthState();

        if (authState.isAuthenticated) {
            signInContent.style.display = 'none';
            signedInContent.style.display = 'block';
            userEmailSpan.textContent = authState.userEmail;
            licenseSection.style.display = 'block';

            const licenseStatus = await checkLicenseStatus();
            if (licenseStatus.isLicensed) {
                licensedContent.style.display = 'block';
                unlicensedContent.style.display = 'none';
                form.style.display = 'block';
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
    }

    async function checkLicenseStatus() {
        const authState = await authHandler.getAuthState();
        if (!authState.isAuthenticated) {
            return { isLicensed: false };
        }

        const licenseData = await licenseHandler.getLicense();
        if (!licenseData.success || !licenseData.licenseKey) {
            return { isLicensed: false };
        }

        const validation = await licenseHandler.validateLicenseKey(licenseData.licenseKey, authState.userEmail);
        return { isLicensed: validation.success && validation.isValid };
    }

    function showStatus(message, type = 'success') {
        const status = document.createElement('div');
        status.textContent = message;
        status.className = `status-message ${type}`;
        form.appendChild(status);
        setTimeout(() => status.remove(), 3000);
    }

    // Settings management
    chrome.storage.sync.get(['apiKey', 'voice', 'volume', 'enabled'], async (data) => {
        if (data.apiKey) {
            apiKeyInput.value = data.apiKey;
            await fetchVoices(data.apiKey);
        }

        if (data.voice) {
            setTimeout(() => {
                voiceSelection.value = data.voice;
                if (voiceSelection.selectedIndex === -1) {
                    voiceSelection.selectedIndex = 0;
                    chrome.storage.sync.set({ voice: voiceSelection.value });
                }
            }, 500);
        }

        if (data.volume !== undefined) {
            volumeSlider.value = data.volume;
        }
        updateVolumeLabel();

        if (data.enabled !== undefined) {
            enableSpeechCheckbox.checked = data.enabled;
        }

        if (!data.apiKey || data.volume === undefined || data.enabled === undefined) {
            saveSettings();
        }
    });

    function updateVolumeLabel() {
        const value = Math.round(volumeSlider.value * 100);
        volumeLabel.textContent = `${value}%`;
    }

    function saveSettings() {
        const settings = {
            apiKey: apiKeyInput.value.trim(),
            voice: voiceSelection.value,
            volume: parseFloat(volumeSlider.value),
            enabled: enableSpeechCheckbox.checked
        };

        chrome.storage.sync.set(settings, () => {
            const status = document.createElement('div');
            status.textContent = 'Settings saved!';
            status.className = 'status-message success';
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