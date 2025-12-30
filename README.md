# Pastebin Lite

A minimal Pastebin-like app with:
- Create text paste
- Shareable URL
- TTL expiry
- Max view limit
- Deterministic testing time

---

## Run Locally
npm install
npm start

App runs at http://localhost:3000

---

## API

### Create Paste
POST /api/pastes
{
 "content": "text",
 "ttl_seconds": 60,
 "max_views": 3
}

### Get Paste JSON
GET /api/pastes/:id

### View HTML
GET /p/:id

---

## Persistence
Redis (Upstash recommended)
set:
REDIS_URL=your_redis_url

---

## Deterministic Testing
Enable:
TEST_MODE=1

Then send header:
x-test-now-ms: <epoch_ms>