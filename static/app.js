// AI Chat Application Frontend Logic (Hỗ trợ Nhận diện & Đọc Giọng nói Tiếng Việt)

let conversationHistory = [];
let serverInfo = {
    local_ip: window.location.hostname,
    port: window.location.port || 5000,
    default_gemini_model: "gemini-3.5-flash-lite",
    default_openai_model: "gpt-4o-mini"
};

// Cấu hình người dùng (lưu trữ trong localStorage trình duyệt)
let userConfig = {
    provider: localStorage.getItem("ai_provider") || "google",
    model: localStorage.getItem("ai_model") || "gemini-3.5-flash-lite",
    apiKey: localStorage.getItem("ai_custom_key") || ""
};

// DOM Elements
const chatContainer = document.getElementById("chatContainer");
const messagesList = document.getElementById("messagesList");
const welcomeScreen = document.getElementById("welcomeScreen");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const inputBoxWrapper = document.getElementById("inputBoxWrapper");
const voiceStatus = document.getElementById("voiceStatus");
const voiceStatusText = document.getElementById("voiceStatusText");
const voiceCancelBtn = document.getElementById("voiceCancelBtn");
const modelBadge = document.getElementById("modelBadge");
const clearBtn = document.getElementById("clearBtn");
const anchorScroll = document.getElementById("anchorScroll");

// Modals
const qrBtn = document.getElementById("qrBtn");
const qrModal = document.getElementById("qrModal");
const closeQrModal = document.getElementById("closeQrModal");
const mobileUrlDisplay = document.getElementById("mobileUrlDisplay");
const copyUrlBtn = document.getElementById("copyUrlBtn");
const qrImage = document.getElementById("qrImage");

const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const closeSettingsModal = document.getElementById("closeSettingsModal");
const providerSelect = document.getElementById("providerSelect");
const modelInput = document.getElementById("modelInput");
const apiKeyInput = document.getElementById("apiKeyInput");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const toast = document.getElementById("toast");

// Quản lý giọng nói (Speech Recognition & Synthesis)
let recognition = null;
let isListening = false;
let shouldAutoSendVoice = true;
let currentUtterance = null;

// Khởi chạy khi tải trang
document.addEventListener("DOMContentLoaded", () => {
    initSettingsUI();
    fetchServerInfo();
    setupEventListeners();
    setupTextareaAutoResize();
    initSpeechRecognition();
});

// Lấy thông tin IP server
async function fetchServerInfo() {
    try {
        const res = await fetch("/api/info");
        if (res.ok) {
            serverInfo = await res.json();
            updateMobileUrl();
        }
    } catch (e) {
        console.log("Không thể kết nối đến /api/info, dùng URL hiện tại.");
        updateMobileUrl();
    }
}

function updateMobileUrl() {
    const port = serverInfo.port || window.location.port || 5000;
    const ip = (serverInfo.local_ip && serverInfo.local_ip !== "127.0.0.1") ? serverInfo.local_ip : window.location.hostname;
    const mobileUrl = `http://${ip}:${port}`;
    
    if (mobileUrlDisplay) {
        mobileUrlDisplay.textContent = mobileUrl;
    }
    
    if (qrImage) {
        qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(mobileUrl)}`;
        qrImage.style.display = "block";
    }
}

function initSettingsUI() {
    providerSelect.value = userConfig.provider;
    modelInput.value = userConfig.model;
    apiKeyInput.value = userConfig.apiKey;
    modelBadge.textContent = userConfig.model;
}

function setupEventListeners() {
    // Gửi tin nhắn
    sendBtn.addEventListener("click", () => handleSendMessage());
    
    // Gõ phím trong textarea
    messageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // Bật/tắt nút gửi khi có text
    messageInput.addEventListener("input", () => {
        sendBtn.disabled = !messageInput.value.trim();
    });

    // Thẻ gợi ý
    document.querySelectorAll(".suggestion-card").forEach(card => {
        card.addEventListener("click", () => {
            const prompt = card.getAttribute("data-prompt");
            if (prompt) {
                messageInput.value = prompt;
                sendBtn.disabled = false;
                handleSendMessage();
            }
        });
    });

    // Xóa lịch sử
    clearBtn.addEventListener("click", () => {
        if (conversationHistory.length === 0) return;
        if (confirm("Bạn có chắc chắn muốn xóa toàn bộ cuộc trò chuyện này?")) {
            conversationHistory = [];
            messagesList.innerHTML = "";
            welcomeScreen.style.display = "block";
            window.speechSynthesis.cancel();
            showToast("Đã làm mới cuộc trò chuyện");
        }
    });

    // Modal QR
    qrBtn.addEventListener("click", () => {
        updateMobileUrl();
        qrModal.classList.add("active");
    });
    closeQrModal.addEventListener("click", () => qrModal.classList.remove("active"));
    copyUrlBtn.addEventListener("click", () => {
        const url = mobileUrlDisplay.textContent;
        navigator.clipboard.writeText(url).then(() => {
            showToast("Đã sao chép liên kết vào bộ nhớ tạm!");
        });
    });

    // Modal Settings
    settingsBtn.addEventListener("click", () => {
        settingsModal.classList.add("active");
    });
    closeSettingsModal.addEventListener("click", () => settingsModal.classList.remove("active"));
    
    providerSelect.addEventListener("change", () => {
        if (providerSelect.value === "openai") {
            modelInput.value = "gpt-4o-mini";
        } else {
            modelInput.value = "gemini-3.5-flash-lite";
        }
    });

    saveSettingsBtn.addEventListener("click", () => {
        userConfig.provider = providerSelect.value;
        userConfig.model = modelInput.value.trim() || (userConfig.provider === "openai" ? "gpt-4o-mini" : "gemini-3.5-flash-lite");
        userConfig.apiKey = apiKeyInput.value.trim();

        localStorage.setItem("ai_provider", userConfig.provider);
        localStorage.setItem("ai_model", userConfig.model);
        localStorage.setItem("ai_custom_key", userConfig.apiKey);

        modelBadge.textContent = userConfig.model;
        settingsModal.classList.remove("active");
        showToast("Đã lưu cài đặt thành công!");
    });

    // Đóng modal khi bấm ra ngoài
    window.addEventListener("click", (e) => {
        if (e.target === qrModal) qrModal.classList.remove("active");
        if (e.target === settingsModal) settingsModal.classList.remove("active");
    });
}

function setupTextareaAutoResize() {
    messageInput.addEventListener("input", function() {
        this.style.height = "auto";
        this.style.height = Math.min(this.scrollHeight, 150) + "px";
    });
}

// ==========================================
// 🎙️ NHẬN DIỆN GIỌNG NÓI (SPEECH TO TEXT)
// ==========================================
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        micBtn.title = "Trình duyệt chưa hỗ trợ nhận diện giọng nói (Hãy dùng Chrome hoặc Edge)";
        micBtn.addEventListener("click", () => {
            showToast("Trình duyệt này không hỗ trợ Speech Recognition. Hãy dùng Google Chrome hoặc Microsoft Edge.");
        });
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN'; // Ngôn ngữ Tiếng Việt
    recognition.interimResults = true; // Trả kết quả chữ viết thời gian thực khi đang nói
    recognition.continuous = false; // Tự ngắt khi người dùng dừng câu nói

    recognition.onstart = () => {
        isListening = true;
        shouldAutoSendVoice = true;
        micBtn.classList.add("listening");
        if (inputBoxWrapper) inputBoxWrapper.classList.add("listening");
        if (voiceStatus) voiceStatus.classList.add("active");
        if (voiceStatusText) voiceStatusText.textContent = "Đang lắng nghe... Nói xong hệ thống sẽ tự động gửi.";
        messageInput.placeholder = "Đang lắng nghe giọng nói của bạn...";
    };

    recognition.onresult = (event) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalText += event.results[i][0].transcript;
            } else {
                interimText += event.results[i][0].transcript;
            }
        }

        const fullText = (finalText || interimText).trim();
        if (fullText) {
            messageInput.value = fullText;
            messageInput.style.height = "auto";
            messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + "px";
            sendBtn.disabled = false;
        }
    };

    recognition.onerror = (event) => {
        console.warn("Speech recognition error:", event.error);
        if (event.error === "not-allowed") {
            showToast("Vui lòng cấp quyền Microphone cho trình duyệt để nói.");
        } else if (event.error !== "no-speech") {
            showToast("Lỗi nhận diện giọng nói: " + event.error);
        }
        stopVoiceListening(false);
    };

    recognition.onend = () => {
        // Khi người dùng dừng nói -> kiểm tra và tự động gửi câu hỏi
        stopVoiceListening(shouldAutoSendVoice);
    };

    // Bấm nút Micro để bắt đầu/dừng
    micBtn.addEventListener("click", () => {
        if (isListening) {
            recognition.stop();
        } else {
            try {
                // Ngừng phát âm thanh nếu đang đọc
                if ('speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                }
                messageInput.value = "";
                recognition.start();
            } catch (err) {
                console.error("Lỗi khởi động nhận diện giọng nói:", err);
            }
        }
    });

    // Nút Dừng trên banner
    if (voiceCancelBtn) {
        voiceCancelBtn.addEventListener("click", () => {
            shouldAutoSendVoice = false;
            if (recognition) recognition.abort();
            stopVoiceListening(false);
            showToast("Đã dừng thu âm");
        });
    }
}

function stopVoiceListening(autoSend = false) {
    isListening = false;
    micBtn.classList.remove("listening");
    if (inputBoxWrapper) inputBoxWrapper.classList.remove("listening");
    if (voiceStatus) voiceStatus.classList.remove("active");
    messageInput.placeholder = "Hỏi bất kỳ câu hỏi nào hoặc bấm Micro để nói...";

    // Tự động gửi nếu có nội dung
    if (autoSend && messageInput.value.trim()) {
        showToast("Đang tự động gửi câu hỏi...");
        setTimeout(() => {
            handleSendMessage();
        }, 400);
    }
}

// ==========================================
// 🔊 PHÁT ÂM THANH (TEXT TO SPEECH)
// ==========================================
function speakText(text, btnElement) {
    if (!('speechSynthesis' in window)) {
        showToast("Trình duyệt không hỗ trợ đọc văn bản thành giọng nói.");
        return;
    }

    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        document.querySelectorAll('.speak-msg-btn').forEach(btn => {
            btn.classList.remove('speaking');
            btn.querySelector('span').textContent = 'Đọc';
        });
        if (btnElement && currentUtterance) {
            currentUtterance = null;
            return;
        }
    }

    // Loại bỏ các ký tự Markdown trước khi đọc
    const cleanText = text
        .replace(/```[\s\S]*?```/g, "đoạn mã lập trình")
        .replace(/[#*`_~\[\]()>-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (!cleanText) return;

    currentUtterance = new SpeechSynthesisUtterance(cleanText);
    currentUtterance.lang = 'vi-VN';
    currentUtterance.rate = 1.0;

    // Chọn giọng tiếng Việt nếu có
    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find(v => v.lang.includes('vi') || v.lang.includes('VN'));
    if (viVoice) {
        currentUtterance.voice = viVoice;
    }

    if (btnElement) {
        btnElement.classList.add('speaking');
        btnElement.querySelector('span').textContent = 'Dừng';
    }

    currentUtterance.onend = () => {
        if (btnElement) {
            btnElement.classList.remove('speaking');
            btnElement.querySelector('span').textContent = 'Đọc';
        }
        currentUtterance = null;
    };

    currentUtterance.onerror = () => {
        if (btnElement) {
            btnElement.classList.remove('speaking');
            btnElement.querySelector('span').textContent = 'Đọc';
        }
        currentUtterance = null;
    };

    window.speechSynthesis.speak(currentUtterance);
}

// ==========================================
// 💬 XỬ LÝ GỬI NHẬN TIN NHẮN
// ==========================================
async function handleSendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    // Dừng thu âm nếu đang bật
    if (isListening && recognition) {
        shouldAutoSendVoice = false;
        recognition.stop();
    }

    // Ẩn welcome screen
    welcomeScreen.style.display = "none";

    // Thêm tin nhắn của User
    appendMessage("user", text);
    conversationHistory.push({ role: "user", content: text });

    // Reset input
    messageInput.value = "";
    messageInput.style.height = "auto";
    sendBtn.disabled = true;

    // Hiện hiệu ứng chờ Bot trả lời
    const loadingElem = appendLoadingMessage();
    scrollToBottom();

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                provider: userConfig.provider,
                model: userConfig.model,
                apiKey: userConfig.apiKey,
                messages: conversationHistory
            })
        });

        const data = await response.json();
        loadingElem.remove();

        if (response.ok && data.status === "success") {
            appendMessage("bot", data.reply);
            conversationHistory.push({ role: "assistant", content: data.reply });
        } else {
            const errorMsg = data.message || "Không thể kết nối đến máy chủ AI.";
            appendErrorMessage(errorMsg);
        }
    } catch (err) {
        loadingElem.remove();
        appendErrorMessage("Lỗi kết nối mạng: " + err.message);
    }

    scrollToBottom();
}

function appendMessage(sender, text) {
    const item = document.createElement("div");
    item.className = `message-item ${sender}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.innerHTML = sender === "user" 
        ? '<i class="fa-solid fa-user"></i>' 
        : '<i class="fa-solid fa-wand-magic-sparkles"></i>';

    const content = document.createElement("div");
    content.className = "message-content";

    if (sender === "user") {
        content.textContent = text;
    } else {
        content.innerHTML = renderMarkdown(text);
        enhanceCodeBlocks(content);

        // Thêm thanh công cụ dưới tin nhắn Bot: Sao chép & Đọc giọng nói
        const actions = document.createElement("div");
        actions.className = "message-actions";

        const copyBtn = document.createElement("button");
        copyBtn.className = "msg-action-btn";
        copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> <span>Sao chép</span>';
        copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(text).then(() => {
                copyBtn.querySelector("span").textContent = "Đã chép!";
                setTimeout(() => copyBtn.querySelector("span").textContent = "Sao chép", 2000);
            });
        });

        const speakBtn = document.createElement("button");
        speakBtn.className = "msg-action-btn speak-msg-btn";
        speakBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i> <span>Đọc</span>';
        speakBtn.addEventListener("click", () => {
            speakText(text, speakBtn);
        });

        actions.appendChild(copyBtn);
        actions.appendChild(speakBtn);
        content.appendChild(actions);
    }

    item.appendChild(avatar);
    item.appendChild(content);
    messagesList.appendChild(item);
    return item;
}

function appendLoadingMessage() {
    const item = document.createElement("div");
    item.className = "message-item bot";

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';

    const content = document.createElement("div");
    content.className = "message-content";
    content.innerHTML = `
        <div class="typing-indicator">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span style="font-size: 12px; color: #94a3b8; margin-left: 6px;">Đang suy nghĩ...</span>
        </div>
    `;

    item.appendChild(avatar);
    item.appendChild(content);
    messagesList.appendChild(item);
    return item;
}

function appendErrorMessage(errorText) {
    const item = document.createElement("div");
    item.className = "message-item bot";

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.style.background = "#ef4444";
    avatar.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';

    const content = document.createElement("div");
    content.className = "message-content";
    content.style.borderColor = "rgba(239, 68, 68, 0.4)";
    content.innerHTML = `
        <div style="color: #f87171; font-weight: 600; margin-bottom: 4px;">Đã xảy ra lỗi:</div>
        <div style="font-size: 13px; color: #cbd5e1;">${escapeHtml(errorText)}</div>
    `;

    item.appendChild(avatar);
    item.appendChild(content);
    messagesList.appendChild(item);
}

function renderMarkdown(rawText) {
    if (typeof marked !== "undefined" && marked.parse) {
        try {
            return marked.parse(rawText);
        } catch (e) {
            console.error("Marked parse error:", e);
        }
    }
    // Fallback nếu thư viện marked chưa kịp tải
    return escapeHtml(rawText)
        .replace(/\n/g, "<br>")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>");
}

function enhanceCodeBlocks(container) {
    const preBlocks = container.querySelectorAll("pre");
    preBlocks.forEach((pre) => {
        const code = pre.querySelector("code");
        if (!code) return;

        // Highlight.js nếu có
        if (typeof hljs !== "undefined") {
            hljs.highlightElement(code);
        }

        // Tạo header cho code block
        const langClass = Array.from(code.classList).find(c => c.startsWith("language-"));
        const langName = langClass ? langClass.replace("language-", "").toUpperCase() : "CODE";

        const header = document.createElement("div");
        header.className = "code-header";
        header.innerHTML = `
            <span>${langName}</span>
            <button class="copy-code-btn">
                <i class="fa-regular fa-copy"></i> <span>Sao chép</span>
            </button>
        `;

        header.querySelector(".copy-code-btn").addEventListener("click", function() {
            const textToCopy = code.innerText;
            navigator.clipboard.writeText(textToCopy).then(() => {
                const span = this.querySelector("span");
                span.textContent = "Đã chép!";
                setTimeout(() => span.textContent = "Sao chép", 2000);
            });
        });

        pre.parentNode.insertBefore(header, pre);
    });
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
    }, 2800);
}

function escapeHtml(string) {
    const entityMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return String(string).replace(/[&<>"']/g, s => entityMap[s]);
}
