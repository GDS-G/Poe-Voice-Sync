import authHandler from './auth.js';
import licenseHandler from './license.js';
import { ALLOW_BETA_LICENSES } from './license-config.js';

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('settings-form');
    const providerSelect = document.getElementById('tts-provider');
    const apiKeyInput = document.getElementById('api-key');
    const apiKeyLabel = document.getElementById('api-key-label');
    const apiKeyLink = document.getElementById('api-key-link');
    const voiceSelection = document.getElementById('voice-selection');
    const volumeSlider = document.getElementById('volume');
    const volumeLabel = document.querySelector('.volume-label');
    const enableSpeechCheckbox = document.getElementById('enable-speech');
    const providerConsentCheckbox = document.getElementById('provider-consent');
    const testButton = document.getElementById('test-tts');
    const testStatus = document.getElementById('test-status');
    const signInContent = document.getElementById('sign-in-content');
    const signInButton = document.getElementById('sign-in-button');
    const signInEmail = document.getElementById('sign-in-email');
    const signedInContent = document.getElementById('signed-in-content');
    const signOutButton = document.getElementById('sign-out-button');
    const userEmailSpan = document.getElementById('user-email');
    const licensedContent = document.getElementById('licensed-content');
    const licenseExpiration = document.getElementById('license-expiration');
    const unlicensedContent = document.getElementById('unlicensed-content');
    const purchaseLicenseButton = document.getElementById('purchase-license');
    const licenseTokenInput = document.getElementById('license-token');
    const activateLicenseButton = document.getElementById('activate-license');
    const activateBetaLicenseButton = document.getElementById('activate-beta-license');
    const loadingIndicator = document.getElementById('loading-indicator');
    let activeProvider = 'elevenlabs';
    let initializing = true;

    chrome.runtime.onMessage.addListener(message => {
        if (message.type === 'LICENSE_UPDATED') checkAndInitialize();
    });

    function showStatus(message, type = 'success') {
        const statusDiv = document.getElementById('status-message');
        statusDiv.textContent = message;
        statusDiv.className = `status-message ${type}`;
        statusDiv.style.display = 'block';
        setTimeout(() => { statusDiv.style.display = 'none'; }, 4000);
    }

    function showError(message) {
        showStatus(message, 'error');
    }

    function updateVolumeLabel() {
        volumeLabel.textContent = `${Math.round(Number(volumeSlider.value) * 100)}%`;
    }

    function updateProviderUi() {
        const info = PoeVoiceTTS.getProviderInfo(activeProvider);
        providerSelect.value = activeProvider;
        apiKeyLabel.textContent = `${info.label} API Key:`;
        apiKeyInput.placeholder = info.apiKeyPlaceholder;
        apiKeyLink.href = info.apiKeyUrl;
        apiKeyLink.textContent = `Get a ${info.label} API key`;
    }

    function updateConsentUi() {
        const consented = providerConsentCheckbox.checked;
        apiKeyInput.disabled = !consented;
        voiceSelection.disabled = !consented;
        testButton.disabled = !consented;
        enableSpeechCheckbox.disabled = !consented;
    }

    function selectedVoice() {
        const option = voiceSelection.selectedOptions[0];
        return {
            id: voiceSelection.value,
            provider: option?.dataset.voiceProvider || (activeProvider === 'hume' ? 'HUME_AI' : 'ELEVENLABS')
        };
    }

    async function storageSnapshot() {
        const [synced, localSecrets] = await Promise.all([
            chrome.storage.sync.get([
                'ttsProvider', 'apiKey', 'apiKeys', 'voice', 'voices', 'humeVoiceProvider',
                'volume', 'enabled', 'providerConsent'
            ]),
            chrome.storage.local.get(['apiKey', 'apiKeys'])
        ]);
        const apiKeys = { ...(synced.apiKeys || {}), ...(localSecrets.apiKeys || {}) };
        const apiKey = localSecrets.apiKey || synced.apiKey || '';

        if (synced.apiKey || synced.apiKeys) {
            await Promise.all([
                chrome.storage.local.set({ apiKey, apiKeys }),
                chrome.storage.sync.remove(['apiKey', 'apiKeys'])
            ]);
        }

        return { ...synced, apiKey, apiKeys };
    }

    async function persistProvider(provider, notify = false) {
        const stored = await storageSnapshot();
        const apiKeys = { ...(stored.apiKeys || {}), [provider]: apiKeyInput.value.trim() };
        const voices = { ...(stored.voices || {}) };
        const currentVoice = selectedVoice();
        if (currentVoice.id) voices[provider] = currentVoice;
        const syncedSettings = {
            ttsProvider: provider,
            voices,
            voice: voices[provider]?.id || '',
            humeVoiceProvider: voices[provider]?.provider || null,
            volume: Number(volumeSlider.value),
            enabled: enableSpeechCheckbox.checked,
            providerConsent: providerConsentCheckbox.checked
        };
        const localSecrets = { apiKeys, apiKey: apiKeys[provider] || '' };
        const settings = { ...syncedSettings, ...localSecrets };
        await Promise.all([
            chrome.storage.sync.set(syncedSettings),
            chrome.storage.local.set(localSecrets),
            chrome.storage.sync.remove(['apiKey', 'apiKeys'])
        ]);
        if (notify) await notifyPoeTabs(settings);
        return settings;
    }

    async function notifyPoeTabs(settings) {
        const tabs = await chrome.tabs.query({ url: '*://*.poe.com/*' });
        await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_UPDATED',
            settings
        })));
    }

    function addVoiceOptions(voices, preferredVoiceId) {
        voiceSelection.textContent = '';
        const orderedVoices = PoeVoiceTTS.orderVoices(activeProvider, voices);
        const addOptions = (parent, groupVoices) => {
            groupVoices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.id;
                option.textContent = voice.name;
                option.dataset.voiceProvider = voice.provider;
                parent.appendChild(option);
            });
        };

        if (activeProvider === 'hume') {
            const custom = orderedVoices.filter(voice => PoeVoiceTTS.isPersonalizedVoice(activeProvider, voice));
            const library = orderedVoices.filter(voice => !PoeVoiceTTS.isPersonalizedVoice(activeProvider, voice));
            if (custom.length) {
                const group = document.createElement('optgroup');
                group.label = 'My Hume Voices';
                addOptions(group, custom);
                voiceSelection.appendChild(group);
            }
            if (library.length) {
                const group = document.createElement('optgroup');
                group.label = 'Hume Voice Library';
                addOptions(group, library);
                voiceSelection.appendChild(group);
            }
        } else {
            const personal = orderedVoices.filter(voice => PoeVoiceTTS.isPersonalizedVoice(activeProvider, voice));
            const library = orderedVoices.filter(voice => !PoeVoiceTTS.isPersonalizedVoice(activeProvider, voice));
            if (personal.length) {
                const group = document.createElement('optgroup');
                group.label = 'My ElevenLabs Voices';
                addOptions(group, personal);
                voiceSelection.appendChild(group);
            }
            if (library.length) {
                const group = document.createElement('optgroup');
                group.label = 'ElevenLabs Voice Library';
                addOptions(group, library);
                voiceSelection.appendChild(group);
            }
        }

        if (preferredVoiceId && orderedVoices.some(voice => voice.id === preferredVoiceId)) {
            voiceSelection.value = preferredVoiceId;
        } else if (voiceSelection.options.length) {
            voiceSelection.selectedIndex = 0;
        }
    }

    async function fetchVoices(apiKey, preferredVoiceId = '') {
        voiceSelection.disabled = true;
        voiceSelection.innerHTML = '<option value="">Loading voices...</option>';
        try {
            const voices = await PoeVoiceTTS.fetchVoices(activeProvider, apiKey);
            addVoiceOptions(voices, preferredVoiceId);
        } catch (error) {
            console.error('Error fetching voices:', error);
            voiceSelection.innerHTML = '<option value="">Error loading voices</option>';
            showError(error.message);
        } finally {
            voiceSelection.disabled = !providerConsentCheckbox.checked;
        }
    }

    async function loadProvider(provider, stored) {
        activeProvider = PoeVoiceTTS.normalizeProvider(provider);
        updateProviderUi();
        const apiKeys = { ...(stored.apiKeys || {}) };
        const voices = { ...(stored.voices || {}) };
        if (!stored.ttsProvider && stored.apiKey && !apiKeys.elevenlabs) apiKeys.elevenlabs = stored.apiKey;
        if (!stored.ttsProvider && stored.voice && !voices.elevenlabs) voices.elevenlabs = { id: stored.voice, provider: 'ELEVENLABS' };
        apiKeyInput.value = apiKeys[activeProvider] || '';
        const preferredVoice = voices[activeProvider]?.id || '';
        if (!providerConsentCheckbox.checked) {
            voiceSelection.innerHTML = '<option value="">Accept the voice data disclosure to load voices</option>';
        } else if (apiKeyInput.value) {
            await fetchVoices(apiKeyInput.value, preferredVoice);
        } else {
            voiceSelection.innerHTML = '<option value="">Enter an API key to load voices</option>';
        }
    }

    async function loadInitialSettings() {
        const stored = await storageSnapshot();
        volumeSlider.value = stored.volume ?? 0.7;
        enableSpeechCheckbox.checked = stored.enabled ?? true;
        providerConsentCheckbox.checked = stored.providerConsent === true;
        updateVolumeLabel();
        await loadProvider(stored.ttsProvider || 'elevenlabs', stored);
        updateConsentUi();
    }

    async function showInterface(userEmail, verification = {}) {
        signInContent.style.display = 'none';
        signedInContent.style.display = 'block';
        userEmailSpan.textContent = userEmail;
        licensedContent.style.display = 'block';
        unlicensedContent.style.display = 'none';
        licenseExpiration.textContent = verification.expiresAt
            ? `Valid through ${new Date(verification.expiresAt * 1000).toLocaleDateString()}`
            : verification.isBeta ? 'Beta test license' : '';
        form.style.display = 'block';
        await loadInitialSettings();
    }

    function showSignedOutInterface(message = '') {
        signInContent.style.display = 'flex';
        signedInContent.style.display = 'none';
        licensedContent.style.display = 'none';
        unlicensedContent.style.display = 'none';
        form.style.display = 'none';
        if (message) showError(message);
    }

    function showUnlicensedInterface(userEmail, message = '') {
        signInContent.style.display = 'none';
        signedInContent.style.display = 'block';
        userEmailSpan.textContent = userEmail;
        licensedContent.style.display = 'none';
        form.style.display = 'none';
        unlicensedContent.style.display = 'block';
        activateBetaLicenseButton.style.display = ALLOW_BETA_LICENSES ? 'block' : 'none';
        if (message) showError(message);
    }

    function openPaymentPage() {
        const width = 500;
        const height = 650;
        const left = Math.floor((screen.width - width) / 2);
        const top = Math.floor((screen.height - height) / 2);
        window.open(
            `https://gds-g.github.io/Poe-Voice-Sync/payment/payment.html?extId=${encodeURIComponent(chrome.runtime.id)}`,
            'Poe Voice Sync Payment',
            `width=${width},height=${height},left=${left},top=${top}`
        );
    }

    async function checkAndInitialize({ attemptSilentSignIn = true } = {}) {
        loadingIndicator.style.display = 'block';
        try {
            let authState = await authHandler.getAuthState();
            if (!authState.isAuthenticated && attemptSilentSignIn) {
                const silentResult = await authHandler.silentSignIn();
                authState = await authHandler.getAuthState();
            }
            if (!authState.isAuthenticated) {
                showSignedOutInterface();
                return;
            }

            await licenseHandler.restoreLicense(authState.userEmail);
            const verification = await licenseHandler.verifyLicenseForEmail(authState.userEmail);
            if (!verification.success || !verification.isValid) {
                showUnlicensedInterface(authState.userEmail, verification.error || 'A paid license is required.');
                return;
            }
            await showInterface(authState.userEmail, verification);
        } catch (error) {
            console.error('Initialization error:', error);
            showSignedOutInterface(`Initialization failed: ${error.message}`);
        } finally {
            loadingIndicator.style.display = 'none';
            initializing = false;
        }
    }

    providerSelect.addEventListener('change', async () => {
        if (initializing) return;
        const nextProvider = PoeVoiceTTS.normalizeProvider(providerSelect.value);
        await persistProvider(activeProvider, false);
        const stored = await storageSnapshot();
        await loadProvider(nextProvider, stored);
        await persistProvider(activeProvider, true);
    });

    apiKeyInput.addEventListener('change', async () => {
        if (apiKeyInput.value.trim()) await fetchVoices(apiKeyInput.value.trim());
        await persistProvider(activeProvider, true);
    });
    voiceSelection.addEventListener('change', () => persistProvider(activeProvider, true));
    volumeSlider.addEventListener('input', () => {
        updateVolumeLabel();
        if (!initializing) persistProvider(activeProvider, true);
    });
    enableSpeechCheckbox.addEventListener('change', () => persistProvider(activeProvider, true));
    providerConsentCheckbox.addEventListener('change', async () => {
        updateConsentUi();
        if (providerConsentCheckbox.checked) {
            const stored = await storageSnapshot();
            await loadProvider(activeProvider, stored);
        } else {
            voiceSelection.innerHTML = '<option value="">Accept the voice data disclosure to load voices</option>';
        }
        await persistProvider(activeProvider, true);
    });

    purchaseLicenseButton.addEventListener('click', openPaymentPage);
    activateLicenseButton.addEventListener('click', async () => {
        activateLicenseButton.disabled = true;
        loadingIndicator.style.display = 'block';
        try {
            const authState = await authHandler.getAuthState();
            if (!authState.isAuthenticated || !authState.userEmail) throw new Error('Sign in before activating a license.');
            const result = await licenseHandler.installSignedLicense(licenseTokenInput.value, authState.userEmail);
            if (!result.success) throw new Error(result.error || 'License activation failed.');
            licenseTokenInput.value = '';
            await checkAndInitialize();
            showStatus('License activated.');
        } catch (error) {
            showError(error.message);
        } finally {
            activateLicenseButton.disabled = false;
            loadingIndicator.style.display = 'none';
        }
    });

    activateBetaLicenseButton.addEventListener('click', async () => {
        if (!ALLOW_BETA_LICENSES) return;
        activateBetaLicenseButton.disabled = true;
        loadingIndicator.style.display = 'block';
        try {
            const authState = await authHandler.getAuthState();
            if (!authState.isAuthenticated || !authState.userEmail) throw new Error('Sign in before activating beta access.');
            const result = await licenseHandler.generateLicenseKey(authState.userEmail, { isBeta: true });
            if (!result.success) throw new Error(result.message || result.error || 'Beta activation failed.');
            await checkAndInitialize({ attemptSilentSignIn: false });
            showStatus('Local beta license activated.');
        } catch (error) {
            showError(error.message);
        } finally {
            activateBetaLicenseButton.disabled = false;
            loadingIndicator.style.display = 'none';
        }
    });

    signInButton.addEventListener('click', async () => {
        signInButton.disabled = true;
        loadingIndicator.style.display = 'block';
        try {
            const result = await authHandler.signIn(signInEmail.value);
            if (!result.success) throw new Error(result.error || 'Sign-in failed.');
            await checkAndInitialize({ attemptSilentSignIn: false });
        } catch (error) {
            showSignedOutInterface(error.message);
        } finally {
            signInButton.disabled = false;
            loadingIndicator.style.display = 'none';
        }
    });

    testButton.addEventListener('click', async () => {
        testButton.disabled = true;
        testStatus.textContent = ' Testing...';
        try {
            if (!providerConsentCheckbox.checked) {
                throw new Error('Accept the voice data disclosure before generating speech.');
            }
            const blob = await PoeVoiceTTS.synthesize({
                provider: activeProvider,
                apiKey: apiKeyInput.value,
                voiceId: voiceSelection.value,
                text: 'This is a test of the Poe Voice Sync settings.'
            });
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            audio.volume = Number(volumeSlider.value);
            const cleanup = () => URL.revokeObjectURL(audioUrl);
            audio.addEventListener('ended', cleanup, { once: true });
            audio.addEventListener('error', cleanup, { once: true });
            await audio.play();
            testStatus.textContent = ' Test successful!';
        } catch (error) {
            console.error('Voice test failed:', error);
            testStatus.textContent = ` Test failed: ${error.message}`;
        } finally {
            testButton.disabled = false;
            setTimeout(() => { testStatus.textContent = ''; }, 5000);
        }
    });

    signOutButton.addEventListener('click', async () => {
        loadingIndicator.style.display = 'block';
        await authHandler.signOut();
        window.close();
    });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        await persistProvider(activeProvider, true);
        showStatus('Settings saved!');
    });

    await checkAndInitialize();
});
