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
        return data.voices;
    } catch (error) {
        console.error("Error fetching voices:", error);
        return [];
    }
}

// Function to convert text to speech using ElevenLabs API
async function textToSpeech(text) {
    try {
        const data = await chrome.storage.sync.get(["apiKey", "voice", "volume"]);
        const apiKey = data.apiKey;
        const userSettings = {
            volume: data.volume !== undefined ? parseFloat(data.volume) : 1.0,
            voice: data.voice || "default_voice_id" // Replace with actual default if needed
        };

        if (!apiKey) {
            console.error("API key is missing.");
            return;
        }

        const response = await fetch("https://api.elevenlabs.io/v1/speech", {
            method: "POST",
            headers: {
                "xi-api-key": apiKey, // Correct header for the API key
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                voice_id: userSettings.voice,
                text: text
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const audioData = await response.blob();
        const audioUrl = URL.createObjectURL(audioData);
        playAudio(audioUrl, userSettings.volume);
    } catch (error) {
        console.error("Error converting text to speech:", error);
    }
}

// Function to play audio
function playAudio(audioUrl, volume) {
    const audio = new Audio(audioUrl);
    audio.volume = volume;
    audio.play();
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "READ_TEXT") {
        if (request.text) {
            textToSpeech(request.text);
            sendResponse({ status: "success" });
        } else {
            console.error("No text provided to read.");
            sendResponse({ status: "failure", message: "No text provided." });
        }
    }
    return true; // Indicate that the response is asynchronous
});
