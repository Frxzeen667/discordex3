// =============================================
// bot.js — Serveur local Discord ID Lookup
// Lance avec : node bot.js
// =============================================

const https = require('https');
const http  = require('http');

const PORT = 3000;

// ─── Helpers ────────────────────────────────────────────────────────────────

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'DiscordDex/2.0',
        ...headers,
      },
    };
    https.get(url, options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('JSON parse error')); }
      });
    }).on('error', reject);
  });
}

// Build Discord CDN avatar URL from user data
function avatarUrl(userId, avatarHash) {
  if (!avatarHash) {
    // Default avatar — based on discriminator (or new system)
    const defaultIndex = (BigInt(userId) >> 22n) % 6n;
    return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
  }
  const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=256`;
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {

  // CORS headers — needed so the HTML file can call this server
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Route: GET /user/:id
  const match = req.url.match(/^\/user\/(\d{17,20})$/);
  if (req.method === 'GET' && match) {
    const userId = match[1];

    try {
      // Uses the public Discord API — no bot token needed for this endpoint
      // It returns limited info: id, username, avatar, discriminator, public_flags
      const data = await httpsGet(`https://discord.com/api/v10/users/${userId}`, {
        'Authorization': 'MTQ5Nzg5NDI1NzUxNDc3NDYxOA.GQ24Cg.JQLw2UJRBlO6zw65n3V5DekjV6_2OMKh8_M4QE',
      });

      const response = {
        id:       data.id,
        username: data.global_name || data.username,
        avatar:   avatarUrl(data.id, data.avatar),
      };

      res.writeHead(200);
      res.end(JSON.stringify(response));
      console.log(`[OK] Lookup ${userId} → ${response.username}`);

    } catch (err) {
      const code = err.message.includes('401') ? 401
                 : err.message.includes('404') ? 404
                 : 500;
      res.writeHead(code);
      res.end(JSON.stringify({ error: err.message }));
      console.log(`[ERR] Lookup ${userId} → ${err.message}`);
    }
    return;
  }

  // 404 for everything else
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║   DISCORDEX BOT — Serveur démarré   ║`);
  console.log(`║   http://localhost:${PORT}              ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
  console.log(`Usage : le site envoie GET /user/<discord_id>`);
  console.log(`Arrêt : Ctrl+C\n`);
});
