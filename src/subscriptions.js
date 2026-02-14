const { pool } = require('./db');

const MAX_SUBSCRIPTIONS = 10;

async function listSubscriptions() {
  const [rows] = await pool.query(
    'SELECT id, name, source_url, enabled, created_at FROM subscriptions ORDER BY created_at DESC'
  );
  return rows;
}

async function countSubscriptions() {
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM subscriptions');
  return rows[0].total;
}

async function createSubscription(name, sourceUrl) {
  const total = await countSubscriptions();
  if (total >= MAX_SUBSCRIPTIONS) {
    throw new Error('Достигнут лимит: не более 10 подписок.');
  }

  await pool.query('INSERT INTO subscriptions (name, source_url) VALUES (?, ?)', [name, sourceUrl]);
}

async function deleteSubscription(id) {
  await pool.query('DELETE FROM subscriptions WHERE id = ?', [id]);
}

async function toggleSubscription(id, enabled) {
  await pool.query('UPDATE subscriptions SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
}

async function listEnabledUrls() {
  const [rows] = await pool.query('SELECT source_url FROM subscriptions WHERE enabled = 1 ORDER BY id ASC');
  return rows.map((item) => item.source_url);
}

module.exports = {
  MAX_SUBSCRIPTIONS,
  listSubscriptions,
  countSubscriptions,
  createSubscription,
  deleteSubscription,
  toggleSubscription,
  listEnabledUrls
};
