// popup.js
import authHandler from './auth.js';
import licenseHandler from './license.js';

// Make licenseHandler available in console for debugging
window.debugLicenseHandler = licenseHandler;

document.addEventListener('DOMContentLoaded', async () => {
    // Get all DOM elements
    const form = document.getElementById('settings-form');
    const apiKeyInput = document.getElementById('api-key');
    const voiceSelection = document.getElementById('voice-selection');
    const volumeSlider = document.getElementById('volume');
    const volumeLabel = document.querySelector('.volume-label');
    const enableSpeechCheckbox = document.getElementById('enable-speech');
    const testButton = document.getElementById('test-tts');
    const signInContent = document.getElementById('sign-in-content');
    const signedInContent = document.getElementById('signed-in-content');
    const signOutButton = document.getElementById('sign-out-button');
    const userEmailSpan = document.getElementById('user-email');
    const licensedContent = document.getElementById('licensed-content');
    const loadingIndicator = document.getElementById('loading-indicator');

    // Initial UI update
    await checkAndInitialize();

    // Listen for license updates
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'LICENSE_UPDATED') {
            checkAndInitialize();
        }
    });

    async function checkAndInitialize() {
        loadingIndicator.style.display = 'block';
        try {
            console.log('Starting initialization check');

            // First check auth state
            const authState = await authHandler.getAuthState();
            console.log('Auth state:', authState);

            if (!authState.isAuthenticated) {
                console.log('Not authenticated, attempting silent sign-in');
                const silentSignIn = await authHandler.silentSignIn();
                if (!silentSignIn) {
                    console.log('Silent sign-in failed, initiating interactive sign-in');
                    await authHandler.signIn();
                }
            }

            // Get fresh auth state after potential sign in
            const currentAuthState = await authHandler.getAuthState();
            if (!currentAuthState.isAuthenticated) {
                console.log('Still not authenticated after sign-in attempt');
                return;
            }

            // Check for stored payment data
            const paymentDataStr = localStorage.getItem('poeVoiceSyncPayment');
            console.log('Found payment data:', paymentDataStr);

            if (paymentDataStr) {
                console.log('Processing stored payment data');
                const paymentData = JSON.parse(paymentDataStr);
                localStorage.removeItem('poeVoiceSyncPayment');

                // Process the payment with background script
                await chrome.runtime.sendMessage({
                    type: 'PAYMENT_COMPLETE',
                    orderId: paymentData.orderId,
                    transactionId: paymentData.transactionId
                });

                // Wait for storage to sync
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Try to restore license first
            console.log('Attempting to restore license for:', currentAuthState.userEmail);
            const restored = await licenseHandler.restoreLicense(currentAuthState.userEmail);
            console.log('License restore attempt result:', restored);

            // Then verify license status
            const verification = await licenseHandler.verifyLicenseForEmail(currentAuthState.userEmail);
            console.log('License verification:', verification);

            if (verification.success && verification.isValid) {
                console.log('License is valid, showing interface');
                await showInterface(currentAuthState.userEmail);
            } else {
                // Check storage for any existing license
                const [syncData, localData] = await Promise.all([
                    chrome.storage.sync.get(['licenseKey', 'licensedEmail']),
                    chrome.storage.local.get(['licenseKey', 'licensedEmail'])
                ]);

                const existingLicense = syncData.licenseKey ? syncData : localData;

                if (existingLicense.licenseKey && existingLicense.licensedEmail === currentAuthState.userEmail) {
                    console.log('Found existing license, activating');
                    const reactivated = await licenseHandler.restoreLicense(currentAuthState.userEmail);
                    if (reactivated.success) {
                        await showInterface(currentAuthState.userEmail);
                        return;
                    }
                }

                console.log('No valid license found, showing payment page');
                openPaymentPage();
            }
        } catch (error) {
            console.error('Initialization error:', error);
            showError('Initialization failed: ' + error.message);
        } finally {
            loadingIndicator.style.display = 'none';
        }
    }

    async function showInterface(userEmail) {
        signInContent.style.display = 'none';
        signedInContent.style.display = 'block';
        userEmailSpan.textContent = userEmail;
        licensedContent.style.display = 'block';
        form.style.display = 'block';
        await loadInitialSettings();
    }

    function openPaymentPage() {
        const width = 500;
        const height = 600;
        const left = Math.floor((screen.width - width) / 2);
        const top = Math.floor((screen.height - height) / 2);

        const paymentWindow = window.open(
            `https://gds-g.github.io/Poe-Voice-Sync/payment/payment.html?extId=${chrome.runtime.id}`,
            'POE Voice Sync Payment',
            `width=${width},height=${height},left=${left},top=${top}`
        );

        // Close the popup
        window.close();
    }

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

        volumeSlider.value = settings.volume ?? 0.7;
        updateVolumeLabel();
        enableSpeechCheckbox.checked = settings.enabled ?? true;
    }

    function showError(message) {
        const statusDiv = document.getElementById('status-message');
        statusDiv.textContent = message;
        statusDiv.className = 'status-message error';
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
    signOutButton.addEventListener('click', async () => {
        loadingIndicator.style.display = 'block';
        try {
            await authHandler.signOut();
            window.close();
        } catch (error) {
            showError('Sign out error: ' + error.message);
        } finally {
            loadingIndicator.style.display = 'none';
        }
    });

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

    function showStatus(message, type = 'success') {
        const statusDiv = document.getElementById('status-message');
        statusDiv.textContent = message;
        statusDiv.className = `status-message ${type}`;
        statusDiv.style.display = 'block';
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }
});