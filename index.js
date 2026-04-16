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

        // تجاوزنا فحص الإصدار من الأنترنت باش ما يتبلوكاش السيرفر
        const version = [2, 3000, 1015901307]; 
        addLog(`📱 إصدار واتساب (ثابت): ${version.join('.')}`);

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

// سيرفر الويب
const server = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.write(`<html dir="rtl"><body style="font-family: Arial; padding: 20px; background: #f4f4f4;">`);
    res.write(`<div style="background: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1);">`);
    res.write(`<h2 style="color: #2c3e50;">شاشة مراقبة واتساب 📡</h2>`);
    res.write(`<h3>الحالة: <span style="color: blue;">${globalStatus}</span></h3>`);
    
    if (globalQR && globalQR.startsWith('data:image')) { 
         res.write(`<div style="text-align: center; margin: 20px;">`);
         res.write(`<h4>سكانيني ضرك! (عندك 20 ثانية) 📱</h4>`);
         res.write(`<img src="${globalQR}" style="border: 3px solid #4CAF50; padding: 10px; border-radius: 10px;" />`);
         res.write(`</div>`);
    } else if (globalQR === "connected") {
         res.write(`<h4 style="color: green; text-align: center;">✅ البوت متصل بنجاح.</h4>`);
    } else {
         res.write(`<p style="color: #d35400;"><b>الرسالة:</b> جاري التحضير...</p>`);
    }
    
    res.write(`<hr><h3>سجل الأحداث (Logs):</h3><ul style="color: #555; background: #e8eaed; padding: 15px; border-radius: 5px; list-style-type: none;">`);
    globalLogs.forEach(log => res.write(`<li>${log}</li>`));
    res.write(`</ul></div></body></html>`);
    res.end();
});

connectToWhatsApp();

const port = process.env.PORT || 3000;
server.listen(port, () => {
    addLog(`🌐 سيرفر الويب شغال...`);
});