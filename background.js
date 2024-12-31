// Function to play audio
function playAudio(blob) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        
        audio.onended = () => {
            URL.revokeObjectURL(url);
            resolve();
        };
        
        audio.onerror = (error) => {
            URL.revokeObjectURL(url);
            reject(error);
        };
        
        audio.play().catch(reject);
    });
}

// Function to convert text to speech using ElevenLabs
async function textToSpeech(text) {
    try {
        // Get settings from storage
        const data = await chrome.storage.sync.get(['apiKey', 'voice', 'stability', 'similarity']);
        const apiKey = data.apiKey;
        
        if (!apiKey) {
            throw new Error("API key not found. Please set your ElevenLabs API key in the extension settings.");
        }

        const voiceId = data.voice || 'EXAVITQu4vr4xnSDxMaL'; // Default voice if none selected
        const stability = data.stability || 0.5;
        const similarity = data.similarity || 0.75;

        console.log('Making request to ElevenLabs...');
        
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': apiKey
            },
            body: JSON.stringify({
                text: text,
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: stability,
                    similarity_boost: similarity
                }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const audioBlob = await response.blob();
        await playAudio(audioBlob);

    } catch (error) {
        console.error("Error converting text to speech:", error);
        throw error;
    }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Message received:", request);

    if (request.type === "READ_TEXT") {
        textToSpeech(request.text)
            .then(() => {
                sendResponse({ status: "success" });
            })
            .catch((error) => {
                console.error("Error in text-to-speech:", error);
                sendResponse({ 
                    status: "error", 
                    message: error.message || "Error converting text to speech" 
                });
            });
        return true; // Keep message channel open for async response
    }
});