document.addEventListener("DOMContentLoaded", () => {
    const apiKeyInput = document.getElementById("api-key");
    const enableSpeechCheckbox = document.getElementById("enable-speech");
    const voiceSelection = document.getElementById("voice-selection");
    const volumeControl = document.getElementById("volume");
    const settingsForm = document.getElementById("save-settings");
    const btnTextToSpeach = document.getElementById("TextToSpeech");
    const textToSpeechBox = document.getElementById("TextToSpeech-Input");

    // Load settings from Chrome storage
    chrome.storage.sync.get(["apiKey", "enabled", "voice", "volume"], (data) => {
        apiKeyInput.value = data.apiKey || "";
        enableSpeechCheckbox.checked = data.enabled !== undefined ? data.enabled : true;
        volumeControl.value = data.volume !== undefined ? data.volume : 1.0;

        if (data.apiKey) {
            fetchVoices(data.apiKey).then(voices => {
                populateVoiceOptions(voices, data.voice);
            }).catch(error => {
                console.error("Error fetching voices:", error);
                populateVoiceOptions([]); // Populate with an empty array to show error message
            });
        }
    });

    // Save settings when the form is submitted
    settingsForm.addEventListener("click", (e) => {
        e.preventDefault();
        const apiKey = apiKeyInput.value.trim();
        const enabled = enableSpeechCheckbox.checked;
        const selectedVoice = voiceSelection.value;
        const volume = parseFloat(volumeControl.value);
        chrome.storage.sync.set({
            apiKey: apiKey,
            enabled: enabled,
            voice: selectedVoice,
            volume: volume
        }, () => {
            alert("Settings saved!");
            // Refetch voices whenever the API key is changed
            if (apiKey) {
                fetchVoices(apiKey).then(voices => {
                    populateVoiceOptions(voices, selectedVoice);
                }).catch(error => {
                    console.error("Error fetching voices:", error);
                    populateVoiceOptions([]); // Populate with an empty array to show error message
                });
            }
        });
    });

    // Function to fetch available voices from ElevenLabs API
    async function fetchVoices(apiKey) {
        try {
            const response = await fetch("https://api.elevenlabs.io/v1/voices", {
                method: "GET",
                headers: {
                    "xi-api-key": apiKey // Correct header for the API key
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();
            console.log("Fetched voices:", data.voices); // Debugging line
            return data.voices;
        } catch (error) {
            console.error("Error fetching voices:", error);
            return [];
        }
    }

    // Populate the voice selection dropdown
    function populateVoiceOptions(voices = [], selectedVoice) {
        voiceSelection.innerHTML = ""; // Clear existing options
    
        if (!Array.isArray(voices) || voices.length === 0) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No voices available";
            voiceSelection.appendChild(option);
            return;
        }
    
        voices.forEach(voice => {
            const option = document.createElement("option");
            option.value = voice.voice_id; // Ensure this matches the API response
            option.textContent = voice.name;
            if (voice.voice_id === selectedVoice) { // Ensure this matches the API response
                option.selected = true;
            }
            voiceSelection.appendChild(option);
        });
    }    

  
    async function ResponseSpeech(url) {

        header = {
            
            "Content-Type": "application/json",
            "xi-api-key": apiKeyInput.value.trim()
          }
          body = {
            "text": "Born and raised in the charming south, I can add a touch of sweet southern hospitality to your audiobooks and podcasts",
            "voice_settings": {
              "stability": 0.5,
              "similarity_boost": 0.5
            }
        }
        try {
            
            const response = await fetch(url, {
                method: "POST",
                headers: { "Accept": "audio/mp3",
                    "Content-Type": "application/json",
                    "xi-api-key": apiKeyInput.value.trim()},
                body:{"text": "Born and raised in the charming south, I can add a touch of sweet southern hospitality to your audiobooks and podcasts",
                    "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.5
                    }
                }
            })
            console.log("respnose status:",response.detail);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response;
        } catch (error) {
            console.error("Error:", error);
            return [];
        }
    }
    btnTextToSpeach.addEventListener("click", (e) => {
        url = "https://api.elevenlabs.io/v1/text-to-speech/"+voiceSelection.value;
        console.log(url)
        ResponseSpeech(url)
       
    });
    


});
