/**
 * Node.js Server cho Web AI Chat (Chạy được ngay lập tức trên máy bạn)
 * Tối ưu hóa 100% cho Windows, hỗ trợ proxy và hệ thống chứng chỉ tự động.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const PORT = process.env.PORT || 5000;
const DEFAULT_GEMINI_KEY = process.env.GEMINI_API_KEY || "AQ.Ab8RN6Iug0UYSj7q5R3H1Sa-Q7mrHf0gZMU6lkD_JithN5mXrg";
const DEFAULT_OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

const STATIC_DIR = path.join(__dirname, 'static');

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

function executeCurl(url, headers, body) {
    return new Promise((resolve, reject) => {
        const tmpFile = path.join(os.tmpdir(), `ai_req_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
        fs.writeFile(tmpFile, body, 'utf-8', (err) => {
            if (err) return reject(err);

            const curlPath = fs.existsSync('C:\\Windows\\System32\\curl.exe') 
                ? 'C:\\Windows\\System32\\curl.exe' 
                : 'curl.exe';

            const args = ['-s', '--max-time', '45', '-X', 'POST', url];
            for (const [k, v] of Object.entries(headers)) {
                args.push('-H', `${k}: ${v}`);
            }
            args.push('-d', `@${tmpFile}`);

            execFile(curlPath, args, { maxBuffer: 10 * 1024 * 1024 }, (execErr, stdout, stderr) => {
                fs.unlink(tmpFile, () => {});
                if (execErr) {
                    return reject(new Error(`Lỗi kết nối máy chủ (${execErr.code}): ${stderr || execErr.message}`));
                }
                resolve(stdout);
            });
        });
    });
}

async function requestAI(url, headers, body) {
    if (process.platform === 'win32' && fs.existsSync('C:\\Windows\\System32\\curl.exe')) {
        return await executeCurl(url, headers, body);
    }
    // Môi trường Cloud Linux (Render, Vercel...) sử dụng fetch nguyên bản
    const res = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: body
    });
    return await res.text();
}

async function callGemini(apiKey, model, messages) {
    model = model || DEFAULT_GEMINI_MODEL;
    const contents = [];
    
    for (const msg of messages) {
        const role = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
        if (msg.content && msg.content.trim()) {
            contents.push({
                role: role,
                parts: [{ text: msg.content }]
            });
        }
    }

    if (contents.length === 0) {
        throw new Error("Nội dung tin nhắn trống.");
    }

    const postData = JSON.stringify({
        contents: contents,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096
        }
    });

    const tryModels = [model];
    if (model !== "gemini-3.1-flash-lite") {
        tryModels.push("gemini-3.1-flash-lite");
    }

    let lastError = null;
    for (const targetModel of tryModels) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
            const stdout = await requestAI(url, { 'Content-Type': 'application/json' }, postData);
            
            const parsed = JSON.parse(stdout);
            if (parsed.error) {
                // Nếu model bị quá tải (503) hoặc 404, thử model dự phòng
                if ((parsed.error.code === 503 || parsed.error.code === 404) && tryModels.length > 1) {
                    lastError = new Error(parsed.error.message);
                    continue;
                }
                throw new Error(`Google API (${parsed.error.code}): ${parsed.error.message}`);
            }

            if (parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content) {
                const parts = parsed.candidates[0].content.parts || [];
                return parts.map(p => p.text || '').join('');
            }
            return "Không có phản hồi từ mô hình.";
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError || new Error("Không thể kết nối đến Google Gemini.");
}

async function callOpenAI(apiKey, model, messages) {
    model = model || DEFAULT_OPENAI_MODEL;
    const formatted = messages.map(m => ({
        role: m.role || 'user',
        content: m.content || ''
    }));

    const postData = JSON.stringify({
        model: model,
        messages: formatted,
        temperature: 0.7
    });

    const url = 'https://api.openai.com/v1/chat/completions';
    const stdout = await requestAI(url, {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    }, postData);

    const parsed = JSON.parse(stdout);
    if (parsed.error) {
        throw new Error(`OpenAI API (${parsed.error.code || 400}): ${parsed.error.message}`);
    }

    if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
        return parsed.choices[0].message.content;
    }
    return "Không có phản hồi từ OpenAI.";
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    // API GET /api/info
    if (req.method === 'GET' && req.url === '/api/info') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            local_ip: getLocalIP(),
            port: PORT,
            has_gemini_key: Boolean(DEFAULT_GEMINI_KEY),
            has_openai_key: Boolean(DEFAULT_OPENAI_KEY),
            default_gemini_model: DEFAULT_GEMINI_MODEL,
            default_openai_model: DEFAULT_OPENAI_MODEL
        }));
        return;
    }

    // API POST /api/chat
    if (req.method === 'POST' && req.url === '/api/chat') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const provider = (data.provider || 'google').toLowerCase();
                const customKey = (data.apiKey || '').trim();
                const model = data.model;
                const messages = data.messages || [];

                let reply = '';
                if (provider === 'openai') {
                    const apiKey = customKey || DEFAULT_OPENAI_KEY;
                    if (!apiKey) throw new Error("Chưa cấu hình OpenAI API Key.");
                    reply = await callOpenAI(apiKey, model, messages);
                } else {
                    const apiKey = customKey || DEFAULT_GEMINI_KEY;
                    if (!apiKey) throw new Error("Chưa cấu hình Google Gemini API Key.");
                    reply = await callGemini(apiKey, model, messages);
                }

                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ status: 'success', reply: reply, provider: provider }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ status: 'error', message: err.message }));
            }
        });
        return;
    }

    // Phục vụ static files
    let filePath = path.join(STATIC_DIR, req.url === '/' ? 'index.html' : req.url);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + err.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log('\n===============================================================');
    console.log('  🌟 AI CHAT BOT WEB SERVER ĐANG CHẠY THÀNH CÔNG! 🌟');
    console.log('===============================================================');
    console.log(`  💻 Trên MÁY TÍNH (PC/Laptop):  http://localhost:${PORT}`);
    console.log(`  📱 Trên ĐIỆN THOẠI (Mobile):   http://${localIP}:${PORT}`);
    console.log('     (Điện thoại chỉ cần kết nối chung mạng Wi-Fi với máy tính)');
    console.log('===============================================================');
    console.log('  👉 Nhấn Ctrl + C để dừng máy chủ.\n');
});
