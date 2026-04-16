const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const http = require('http');
const url = require('url');
const mysql = require('mysql2/promise');
const fs = require('fs');
const QRCode = require('qrcode'); // 👈 زدنا هاد المكتبة

const API_KEY = "Sami_Secure_Key_2026_!@#";  87.98.160.37
const sessions = new Map();

// إعدادات الداتا بيس (خليها كيما درتها أنت)
const dbConfig = {
    host: '87.98.160.37', 
    user: 'xxpuayvw_sms',
    password: 'Sami1980H',
    database: 'xxpuayvw_sms'
};

const pool = mysql.createPool(dbConfig);

async function getSession(userId) {
    if (sessions.has(userId)) return sessions.get(userId);

    const sessionPath = `./auth_info/user_${userId}`;
    
    try {
        const [rows] = await pool.execute('SELECT data FROM whatsapp_sessions WHERE user_id = ?', [userId]);
        if (rows.length > 0) {
            if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });
            fs.writeFileSync(`${sessionPath}/creds.json`, rows[0].data);
        }
    } catch (e) { console.log("DB Read Error:", e.message); }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({ version, auth: state, printQRInTerminal: false });

    const sessionData = { sock, qr: "", status: "جاري الاتصال... ⏳" };
    sessions.set(userId, sessionData);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            // 👈 السحر هنا: نحولو النص إلى صورة Base64 ديريكت
            sessionData.qr = await QRCode.toDataURL(qr);
            sessionData.status = "يجب المسح الضوئي (QR)";
        }
        if (connection === 'open') {
            sessionData.status = "متصل ✅";
            sessionData.qr = "connected";
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) getSession(userId);
            else {
                sessions.delete(userId);
                await pool.execute('DELETE FROM whatsapp_sessions WHERE user_id = ?', [userId]);
            }
        }
    });

    sock.ev.on('creds.update', async () => {
        await saveCreds();
        const creds = fs.readFileSync(`${sessionPath}/creds.json`, 'utf-8');
        await pool.execute('INSERT INTO whatsapp_sessions (user_id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = ?', [userId, creds, creds]);
    });

    return sessionData;
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const parsedUrl = url.parse(req.url, true);
    const userId = parsedUrl.query.user_id;

    if (parsedUrl.pathname === '/api/status' && userId) {
        const session = await getSession(userId);
        return res.end(JSON.stringify({ status: session.status, qr: session.qr }));
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/api/send') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            const data = JSON.parse(body);
            if (data.api_key !== API_KEY) return res.end(JSON.stringify({ success: false }));
            const session = await getSession(data.user_id);
            await session.sock.sendMessage(data.phone + "@s.whatsapp.net", { text: data.message });
            res.end(JSON.stringify({ success: true }));
        });
        return;
    }
    res.end(JSON.stringify({ message: "Nadine SaaS Active 🚀" }));
});

server.listen(process.env.PORT || 3000);