const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const dns = require('dns');

// 🌟 السحر لي يحل مشكل التعليق في cPanel (إجبار السيرفر على استخدام IPv4)
dns.setDefaultResultOrder('ipv4first');

// إضافة fetchLatestBaileysVersion لمعرفة إصدار الواتساب
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode');

let globalQR = "";
let globalStatus = "في انتظار الإقلاع...";
let globalLogs = [];
let globalSock; // 🌟 هادي لي زدناها

function addLog(msg) {
    let time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${msg}`);
    globalLogs.push(`[${time}] ${msg}`);
    if(globalLogs.length > 20) globalLogs.shift();
}

process.on('uncaughtException', err => addLog('🚨 كراش: ' + err.message));
process.on('unhandledRejection', err => addLog('🚨 رفض: ' + err));

const authPath = path.join(__dirname, 'auth_info');

async function connectToWhatsApp() {
    try {
        addLog("📂 جاري تحضير ملفات الذاكرة...");
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        addLog("✅ الذاكرة جاهزة!");

        const { version } = await fetchLatestBaileysVersion();
        addLog(`📱 إصدار واتساب الحالي: ${version.join('.')}`);

        const sock = makeWASocket({
            version, // إرسال الإصدار الصحيح
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            browser: ["AlfaNadin", "Chrome", "1.0.0"],
            connectTimeoutMs: 60000,
            
            // 🌟 الضربة القاضية لتخفيف استهلاك الرام في الاستضافات المشتركة 🌟
            syncFullHistory: false, 
            generateHighQualityLinkPreview: false,
            markOnlineOnConnect: false
        });
        globalSock = sock;
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (connection === 'connecting') {
                addLog("⏳ جاري الاتصال بسيرفرات واتساب (WebSocket)...");
            }

            if (qr) {
                addLog("🔄 واتساب وافق! جاري رسم الكود...");
                qrcode.toDataURL(qr, (err, url) => {
                    if (!err) {
                        globalQR = url;
                        addLog("✅ الصورة واجدة! سكانيني ضرك.");
                    }
                });
            }

            if (connection === 'close') {
                const errorMsg = lastDisconnect?.error?.message || "بدون سبب";
                addLog("❌ تم قطع الاتصال: " + errorMsg);
                
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    addLog("جاري محاولة إعادة الاتصال...");
                    setTimeout(connectToWhatsApp, 3000);
                }
            } else if (connection === 'open') {
                globalStatus = "متصل ومستعد للعمل! ✅";
                globalQR = "connected";
                addLog("🎉 مبروك! تم الاتصال بنجاح!");
            }
        });

        sock.ev.on('creds.update', saveCreds);

    } catch (error) {
        addLog("🚨 خطأ: " + error.message);
    }
}

// 🌟 فحص الأنترنت تاع السيرفر (باش نعرفو إذا الاستضافة راهي مبلوكياتنا)
addLog("📡 جاري فحص اتصال السيرفر بالأنترنت الخارجية...");
https.get('https://www.google.com', (res) => {
    if(res.statusCode === 200) {
        addLog("🌍 اختبار الأنترنت: نجاح! السيرفر متصل بالعالم الخارجي.");
    }
}).on('error', (e) => {
    addLog("🚫 كارثة: الاستضافة قاطعة الأنترنت على Node.js (Firewall)!");
    addLog("تفاصيل القطع: " + e.message);
});

const server = http.createServer((req, res) => {
    // 🌟 إعدادات CORS باش المنصة تاعك تقدر تتصل بيه بلا مشاكل
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // الرد السريع على طلبات المتصفح المسبقة
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // 🌟 مسار قراءة الحالة (القديم)
    if (req.method === 'GET' && req.url === '/api/status') {
        res.writeHead(200);
        res.end(JSON.stringify({ 
            status: globalStatus, 
            qr: globalQR, 
            logs: globalLogs.slice(-5) 
        }));
        return;
    }

    // 🌟 مسار إرسال الرسائل (الجديد)
    if (req.method === 'POST' && req.url === '/api/send') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                // واتساب يحتاج الرقم يكون بالصيغة الدولية وبلا + مع لاحقة خاصة
                const phone = data.phone + "@s.whatsapp.net"; 
                const message = data.message;

                if (globalSock) {
                    await globalSock.sendMessage(phone, { text: message });
                    addLog(`📤 تم إرسال رسالة إلى ${data.phone}`);
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, msg: "تم الإرسال بنجاح! 🚀" }));
                } else {
                    res.writeHead(500);
                    res.end(JSON.stringify({ success: false, msg: "البوت غير متصل بالواتساب." }));
                }
            } catch (error) {
                addLog(`❌ خطأ في الإرسال: ${error.message}`);
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });
        return;
    }

    // رسالة افتراضية
    res.writeHead(200);
    res.end(JSON.stringify({ message: "سيرفر واتساب يعمل بنجاح! 🚀" }));
});

connectToWhatsApp();

const port = process.env.PORT || 3000;
server.listen(port, () => {
    addLog(`🌐 سيرفر الويب شغال...`);
});