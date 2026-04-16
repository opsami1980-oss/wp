const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    delay
} = require('@whiskeysockets/baileys');
const http = require('http');
const url = require('url');
const mysql = require('mysql2/promise');
const fs = require('fs');

const API_KEY = "Sami_Secure_Key_2026_!@#";
const sessions = new Map();

// 1. إعداد الاتصال بقاعدة البيانات (Octenium) 
const dbConfig = {
    host: '87.98.160.37',
    user: 'xxpuayvw_sms',
    password: 'Sami1980H',
    database: 'xxpuayvw_sms',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

// 2. دالة تشغيل الجلسة (SaaS Multi-Session)
async function getSession(userId) {
    if (sessions.has(userId)) return sessions.get(userId);

    // المسار المحلي للجلسة (Render يستعملو مؤقتا)
    const sessionPath = `./auth_info/user_${userId}`;
    
    // جلب البيانات من DB إذا كانت موجودة قبل البدء
    try {
        const [rows] = await pool.execute('SELECT data FROM whatsapp_sessions WHERE user_id = ?', [userId]);
        if (rows.length > 0) {
            if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });
            // هنا نرجعو الملفات من DB للمجلد المحلي باش Baileys يقرأها
            const authData = JSON.parse(rows[0].data);
            fs.writeFileSync(`${sessionPath}/creds.json`, JSON.stringify(authData));
        }
    } catch (e) { console.log("DB Read Error:", e.message); }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ["NadineBot SaaS", "Chrome", "1.0.0"]
    });

    const sessionData = { sock, qr: "", status: "جاري الاتصال... ⏳", userId };
    sessions.set(userId, sessionData);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            sessionData.qr = qr;
            sessionData.status = "يجب المسح الضوئي (QR)";
        }
        if (connection === 'open') {
            sessionData.status = "متصل ✅";
            sessionData.qr = "connected";
            console.log(`User ${userId} connected!`);
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                getSession(userId);
            } else {
                sessionData.status = "غير متصل (تم تسجيل الخروج)";
                sessions.delete(userId);
                // إذا ديسكونيكتا، نمسحو من DB
                await pool.execute('DELETE FROM whatsapp_sessions WHERE user_id = ?', [userId]);
                if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true });
            }
        }
    });

    // 💾 أهم خطوة: حفظ "الربطة" في الداتا بيس كل ما تتبدل
    sock.ev.on('creds.update', async () => {
        await saveCreds();
        try {
            const creds = JSON.parse(fs.readFileSync(`${sessionPath}/creds.json`));
            const data = JSON.stringify(creds);
            await pool.execute(
                'INSERT INTO whatsapp_sessions (user_id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = ?',
                [userId, data, data]
            );
        } catch (e) { console.log("DB Save Error:", e.message); }
    });

    return sessionData;
}

// 3. سيرفر الويب (الروابط)
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
                if (data.api_key !== API_KEY) return res.end(JSON.stringify({ success: false, msg: "خطأ في الحماية" }));
                
                const session = await getSession(data.user_id);
                if (session.status !== "متصل ✅") return res.end(JSON.stringify({ success: false, msg: "الواتساب غير متصل" }));

                const phone = data.phone + "@s.whatsapp.net";
                await session.sock.sendMessage(phone, { text: data.message });
                res.end(JSON.stringify({ success: true, msg: "تم الإرسال بنجاح!" }));
            } catch (e) { res.end(JSON.stringify({ success: false, error: e.message })); }
        });
        return;
    }

    res.end(JSON.stringify({ message: "سيرفر نادين SaaS بالداتا بيس يعمل! 🚀" }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));