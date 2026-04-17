const server = http.createServer(async (req, res) => {
    // 🛑 كاسحة الجليد (CORS Bypass) - هادو 4 سطور هما الصح
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // إذا المتصفح بعث طلب استكشاف (OPTIONS)، نجاوبوه باللي الطريق مسموح تم تم
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

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
            try {
                const data = JSON.parse(body);
                if (data.api_key !== API_KEY) return res.end(JSON.stringify({ success: false }));
                const session = await getSession(data.user_id);
                await session.sock.sendMessage(data.phone + "@s.whatsapp.net", { text: data.message });
                res.end(JSON.stringify({ success: true }));
            } catch (e) { res.end(JSON.stringify({ success: false, error: e.message })); }
        });
        return;
    }
    res.end(JSON.stringify({ message: "Nadine SaaS Fast Sync! 🚀" }));
});

server.listen(process.env.PORT || 3000);