const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

function randomText(size = 16) {
  return crypto.randomBytes(size).toString('base64url').slice(0, size);
}

async function ensureInitialAdmin() {
  const [admins] = await pool.query('SELECT id FROM admins LIMIT 1');
  if (admins.length > 0) {
    return null;
  }

  const username = `admin_${randomText(6)}`;
  const password = `${randomText(8)}${randomText(8)}`;
  const passwordHash = await bcrypt.hash(password, 12);

  await pool.query('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
  return { username, password };
}

async function findAdminByUsername(username) {
  const [rows] = await pool.query('SELECT id, username, password_hash FROM admins WHERE username = ? LIMIT 1', [username]);
  return rows[0] || null;
}

module.exports = { ensureInitialAdmin, findAdminByUsername, randomText };
