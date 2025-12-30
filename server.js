const express = require("express");
const Redis = require("ioredis");
const { v4: uuidv4 } = require("uuid");
//const helmet = require("helmet");
const path = require("path");

const app = express();
app.use(express.json());
// app.use(helmet());
//app.use(
// helmet({
// contentSecurityPolicy: false,
// crossOriginEmbedderPolicy: false,
// crossOriginResourcePolicy: false
// })
//);
app.use((req, res, next) => {
    res.removeHeader("Content-Security-Policy");
    res.setHeader("Content-Security-Policy", "script-src 'self' 'unsafe-inline'");
    next();
});
app.use(express.static("public"));

const redis = new Redis(process.env.REDIS_URL, {
    tls: { rejectUnauthorized: false }
});
// helper time
function getNow(req) {
    if (process.env.TEST_MODE === "1") {
        const testHeader = req.headers["x-test-now-ms"];
        if (testHeader) return Number(testHeader);
    }
    return Date.now();
}

// healthz
app.get("/api/healthz", async(req, res) => {
    try {
        await redis.ping();
        res.json({ ok: true });
    } catch {
        res.status(500).json({ ok: false });
    }
});

// create paste
app.post("/api/pastes", async(req, res) => {
    const { content, ttl_seconds, max_views } = req.body;

    if (!content || typeof content !== "string" || content.trim() === "") {
        return res.status(400).json({ error: "content is required" });
    }

    if (ttl_seconds && (!Number.isInteger(ttl_seconds) || ttl_seconds < 1)) {
        return res.status(400).json({ error: "ttl_seconds must be >= 1" });
    }

    if (max_views && (!Number.isInteger(max_views) || max_views < 1)) {
        return res.status(400).json({ error: "max_views must be >= 1" });
    }

    const id = uuidv4();
    const now = getNow(req);
    const expiresAt = ttl_seconds ? now + ttl_seconds * 1000 : null;

    const pasteData = {
        content,
        max_views: max_views || null,
        remaining_views: max_views || null,
        expires_at: expiresAt,
        created_at: now
    };

    await redis.set(id, JSON.stringify(pasteData));

    res.json({
        id,
        url: `${req.protocol}://${req.get("host")}/p/${id}`
    });

});

// fetch paste json
app.get("/api/pastes/:id", async(req, res) => {
    const id = req.params.id;
    const raw = await redis.get(id);

    if (!raw) return res.status(404).json({ error: "not found" });

    const paste = JSON.parse(raw);
    const now = getNow(req);

    if (paste.expires_at && now >= paste.expires_at) {
        await redis.del(id);
        return res.status(404).json({ error: "expired" });
    }

    if (paste.max_views && paste.remaining_views <= 0) {
        await redis.del(id);
        return res.status(404).json({ error: "view limit exceeded" });
    }

    if (paste.max_views) {
        paste.remaining_views -= 1;
        await redis.set(id, JSON.stringify(paste));
    }

    res.json({
        content: paste.content,
        remaining_views: paste.max_views ? paste.remaining_views : null,
        expires_at: paste.expires_at ?
            new Date(paste.expires_at).toISOString() : null
    });
});

// html view
app.get("/p/:id", async(req, res) => {
    const id = req.params.id;
    const raw = await redis.get(id);

    if (!raw) return res.status(404).send("Not Found");

    const paste = JSON.parse(raw);
    const now = getNow(req);

    if (paste.expires_at && now >= paste.expires_at) {
        await redis.del(id);
        return res.status(404).send("Expired");
    }

    if (paste.max_views && paste.remaining_views <= 0) {
        await redis.del(id);
        return res.status(404).send("View Limit Exceeded");
    }

    if (paste.max_views) {
        paste.remaining_views -= 1;
        await redis.set(id, JSON.stringify(paste));
    }

    const safeContent = paste.content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    res.send(`
  <html>
    <head><title>Paste</title></head>
    <body>
      <h2>Paste Content</h2>
      <pre>${safeContent}</pre>
    </body>
  </html>
  `);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Running on", port));