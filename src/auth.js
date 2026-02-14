const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

function randomPart(size = 8) {
  return crypto.randomBytes(size).toString('base64url').slice(0, size);
}

async function ensureInitialAdmin() {
  const [rows] = await pool.query('SELECT id FROM admins LIMIT 1');
  if (rows.length > 0) {
    return null;
  }

  const username = `admin_${randomPart(6)}`;
  const password = `${randomPart(10)}${randomPart(6)}`;
  const passwordHash = await bcrypt.hash(password, 12);

  await pool.query('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [username, passwordHash]);

  return { username, password };
}

async function findAdminByUsername(username) {
  const [rows] = await pool.query('SELECT id, username, password_hash FROM admins WHERE username = ? LIMIT 1', [username]);
  return rows[0] || null;
}

module.exports = {
  ensureInitialAdmin,
  findAdminByUsername
};
