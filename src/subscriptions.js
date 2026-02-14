const { pool } = require('./db');

const MAX_SUBSCRIPTIONS = 10;

async function listSubscriptions() {
  const [rows] = await pool.query('SELECT id, title, url, created_at FROM subscriptions ORDER BY created_at DESC');
  return rows;
}

async function countSubscriptions() {
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM subscriptions');
  return rows[0].total;
}

async function addSubscription(title, url) {
  const total = await countSubscriptions();
  if (total >= MAX_SUBSCRIPTIONS) {
    throw new Error('Нельзя добавить больше 10 подписок.');
  }
  await pool.query('INSERT INTO subscriptions (title, url) VALUES (?, ?)', [title, url]);
}

async function deleteSubscription(id) {
  await pool.query('DELETE FROM subscriptions WHERE id = ?', [id]);
}

module.exports = {
  MAX_SUBSCRIPTIONS,
  listSubscriptions,
  countSubscriptions,
  addSubscription,
  deleteSubscription
};
