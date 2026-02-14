const { pool } = require('./db');
const { randomText } = require('./auth');

const URI_PREFIXES = ['vmess://', 'vless://', 'trojan://', 'ss://', 'ssr://', 'hysteria://', 'hy2://', 'tuic://'];

function normalizeLines(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function maybeDecodeBase64(payload) {
  const cleaned = payload.replace(/\s+/g, '');
  if (!cleaned || cleaned.length % 4 === 1) {
    return null;
  }

  try {
    const decoded = Buffer.from(cleaned, 'base64').toString('utf-8');
    return decoded.includes('://') ? decoded : null;
  } catch (error) {
    return null;
  }
}

function extractUris(payload) {
  const decoded = maybeDecodeBase64(payload);
  const content = decoded || payload;

  return normalizeLines(content).filter((line) => URI_PREFIXES.some((prefix) => line.startsWith(prefix)));
}

async function ensureFeedToken() {
  const [rows] = await pool.query('SELECT token FROM feed_tokens LIMIT 1');
  if (rows.length > 0) {
    return rows[0].token;
  }

  const token = randomText(32);
  await pool.query('INSERT INTO feed_tokens (token) VALUES (?)', [token]);
  return token;
}

async function findFeedToken(token) {
  const [rows] = await pool.query('SELECT id, token FROM feed_tokens WHERE token = ? LIMIT 1', [token]);
  return rows[0] || null;
}

async function mergeSubscriptions(urls, timeoutMs) {
  const merged = new Set();

  await Promise.all(
    urls.map(async (url) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'User-Agent': 'connector/2.0'
          }
        });
        clearTimeout(timer);

        if (!response.ok) {
          return;
        }

        const body = await response.text();
        const uris = extractUris(body);
        uris.forEach((uri) => merged.add(uri));
      } catch (error) {
        // skip broken source without interrupting whole merge
      }
    })
  );

  const plain = Array.from(merged).join('\n');
  return Buffer.from(plain, 'utf-8').toString('base64');
}

module.exports = {
  ensureFeedToken,
  findFeedToken,
  mergeSubscriptions
};
