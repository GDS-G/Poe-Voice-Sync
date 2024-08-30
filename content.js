// Function to add a voice icon next to each chatbot response
function addVoiceIcon(element) {
    const voiceIcon = document.createElement("img");
    voiceIcon.src = chrome.runtime.getURL("icons/icon16.png"); // Ensure this points to your icon
    voiceIcon.style.cursor = "pointer";
    voiceIcon.style.marginLeft = "10px";
    voiceIcon.style.width = "16px"; // Adjust size as needed
    voiceIcon.style.height = "16px"; // Adjust size as needed

    // When the icon is clicked, trigger TTS regardless of the 'Enable Speech' setting
    voiceIcon.addEventListener("click", () => {
        chrome.runtime.sendMessage({
            type: "READ_TEXT",
            text: element.innerText
        });
    });

    // Avoid adding multiple icons to the same element
    if (!element.querySelector("img[src*='icon16.png']")) {
        element.appendChild(voiceIcon);
    }
}

// Function to handle automatic TTS
function handleAutoSpeech(element) {
    chrome.storage.sync.get("enabled", (data) => {
        if (data.enabled) {
            chrome.runtime.sendMessage({
                type: "READ_TEXT",
                text: element.innerText
            });
        }
    });
}

// Function to observe changes in the DOM (e.g., new chatbot responses)
function observeChat() {
    const chatContainer = document.querySelector('.ChatMessages'); // Replace with the actual selector

    if (!chatContainer) {
        console.error("Chat container not found. Please check the selector.");
        return;
    }

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && node.querySelector('.ChatMessage_messageBubble__j5ngy')) { 
                    const messageElement = node.querySelector('.ChatMessage_messageBubble__j5ngy');
                    const assistantText = messageElement.querySelector('.class-for-message-text').innerText; // Adjust the selector to grab only the message text
                    // Add voice icon and handle auto speech
                    addVoiceIcon(messageElement);
                    handleAutoSpeech(messageElement);
                }
            });
        });
    });

    observer.observe(chatContainer, { childList: true, subtree: true });
}

// Initialize the script
document.addEventListener("DOMContentLoaded", () => {
    observeChat();
});
