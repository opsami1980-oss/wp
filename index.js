const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const http = require('http');
const url = require('url');
const fs = require('fs');

const sessions = new Map();
const API_KEY = "Sami_Secure_Key_2026_!@#"; // نفس المفتاح اللي في PHP

async function getSession(userId) {
    if (sessions.has(userId)) return sessions.get(userId);

    const sessionPath = `./auth_info/user_${userId}`;
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ["NadineBot", "Chrome", "1.0.0"]
    });

    const sessionData = {
        sock,
        qr: "",
        status: "جاري الاتصال... ⏳",
        userId
    };

    sessions.set(userId, sessionData);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            sessionData.qr = qr;
            sessionData.status = "يجب المسح الضوئي (QR)";
        }
        if (connection === 'open') {
            sessionData.status = "متصل ✅";
            sessionData.qr = "connected";
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                getSession(userId);
            } else {
                sessionData.status = "غير متصل (تم تسجيل الخروج)";
                sessions.delete(userId);
                if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true });
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
    return sessionData;
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    const parsedUrl = url.parse(req.url, true);
    const userId = parsedUrl.query.user_id;

    if (req.method === 'GET' && parsedUrl.pathname === '/api/status') {
        if (!userId) return res.end(JSON.stringify({ error: "user_id مطلوب" }));
        const session = await getSession(userId);
        return res.end(JSON.stringify({ status: session.status, qr: session.qr }));
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/send') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                if (data.api_key !== API_KEY) return res.end(JSON.stringify({ success: false, msg: "خطأ في مفتاح الحماية" }));
                
                const session = await getSession(data.user_id);
                if (session.status !== "متصل ✅") return res.end(JSON.stringify({ success: false, msg: "الواتساب غير متصل لهذا التاجر" }));

                const phone = data.phone + "@s.whatsapp.net";
                await session.sock.sendMessage(phone, { text: data.message });
                res.end(JSON.stringify({ success: true, msg: "تم الإرسال بنجاح! 🚀" }));
            } catch (e) {
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
        return;
    }

    res.end(JSON.stringify({ message: "سيرفر نادين بوت SaaS يعمل! 🚀" }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));