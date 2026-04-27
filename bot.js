// =============================================
// DISCORDEX — Ultra Fast ID Lookup Server
// =============================================

const https = require('https');
const http  = require('http');

const PORT = 3000;

// ─── CONFIG ───────────────────────────────────

const CACHE_TTL = 1000 * 60 * 5; // 5 minutes
const BOT_TOKEN = process.env.BOT_TOKEN;

// HTTPS agent (keep-alive = faster)
const agent = new https.Agent({ keepAlive: true });

// Simple in-memory cache
const cache = new Map();

// ─── HELPERS ──────────────────────────────────

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      agent,
      headers: {
        'User-Agent': 'DiscordDex/3.0',
        ...headers
      }
    }, (res) => {

      let raw = '';

      res.on('data', chunk => raw += chunk);

      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`HTTP_${res.statusCode}`));
        }

        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error('INVALID_JSON'));
        }
      });

    }).on('error', reject);
  });
}

// Avatar builder
function avatarUrl(userId, avatarHash) {
  if (!avatarHash) {
    const defaultIndex = (BigInt(userId) >> 22n) % 6n;
    return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
  }
  const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=256`;
}

// Cache helpers
function getCached(id) {
  const entry = cache.get(id);
  if (!entry) return null;

  if (Date.now() > entry.expire) {
    cache.delete(id);
    return null;
  }

  return entry.data;
}

function setCache(id, data) {
  cache.set(id, {
    data,
    expire: Date.now() + CACHE_TTL
  });
}

// ─── FETCHERS ─────────────────────────────────

// Primary: Discord API
async function fetchDiscord(userId) {
  if (!BOT_TOKEN) throw new Error('NO_TOKEN');

  const data = await httpsGet(
    `https://discord.com/api/v10/users/${userId}`,
    { Authorization: `Bot ${BOT_TOKEN}` }
  );

  return {
    id: data.id,
    username: data.global_name || data.username,
    avatar: avatarUrl(data.id, data.avatar)
  };
}

// Fallback: Lanyard API (faster, public)
async function fetchLanyard(userId) {
  const data = await httpsGet(
    `https://api.lanyard.rest/v1/users/${userId}`
  );

  if (!data.success) throw new Error('LANYARD_FAIL');

  return {
    id: data.data.discord_user.id,
    username: data.data.discord_user.global_name || data.data.discord_user.username,
    avatar: avatarUrl(
      data.data.discord_user.id,
      data.data.discord_user.avatar
    )
  };
}

// Main resolver (Discord → fallback)
async function resolveUser(userId) {
  try {
    return await fetchDiscord(userId);
  } catch (err) {
    console.log(`[FALLBACK] Discord failed → ${err.message}`);
    return await fetchLanyard(userId);
  }
}

// ─── SERVER ───────────────────────────────────

const server = http.createServer(async (req, res) => {

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Route: /user/:id
  const match = req.url.match(/^\/user\/(\d{17,20})$/);

  if (req.method === 'GET' && match) {
    const userId = match[1];

    // ✅ Cache hit
    const cached = getCached(userId);
    if (cached) {
      console.log(`[CACHE] ${userId}`);
      res.writeHead(200);
      return res.end(JSON.stringify(cached));
    }

    try {
      const user = await resolveUser(userId);

      setCache(userId, user);

      console.log(`[OK] ${userId} → ${user.username}`);

      res.writeHead(200);
      res.end(JSON.stringify(user));

    } catch (err) {
      console.log(`[ERR] ${userId} → ${err.message}`);

      res.writeHead(500);
      res.end(JSON.stringify({
        error: err.message
      }));
    }

    return;
  }

  // 404
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ─── START ────────────────────────────────────

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║     DISCORDEX PRO — FAST SERVER     ║
║     http://localhost:${PORT}         ║
╚══════════════════════════════════════╝

✔ Cache TTL: ${CACHE_TTL / 1000}s
✔ Keep-Alive: ON
✔ Fallback API: ON

Usage → GET /user/<discord_id>
Stop  → Ctrl+C
`);
});
