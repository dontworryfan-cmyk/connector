const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(process.cwd(), '.env') });

const requiredVars = [
  'APP_BASE_URL',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'SESSION_SECRET'
];

for (const name of requiredVars) {
  if (!process.env[name]) {
    throw new Error(`Missing required env var: ${name}`);
  }
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  appBaseUrl: process.env.APP_BASE_URL.replace(/\/$/, ''),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  sessionSecret: process.env.SESSION_SECRET,
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 15000),
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
  }
};
