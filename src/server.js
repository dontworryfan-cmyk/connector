const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const bcrypt = require('bcryptjs');

const config = require('./config');
const { pool, initDatabase } = require('./db');
const { ensureInitialAdmin, findAdminByUsername } = require('./auth');
const {
  MAX_SUBSCRIPTIONS,
  listSubscriptions,
  countSubscriptions,
  addSubscription,
  deleteSubscription
} = require('./subscriptions');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use('/static', express.static(path.join(__dirname, 'public')));

const sessionStore = new MySQLStore(
  {
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 24 * 60 * 60 * 1000,
    createDatabaseTable: true
  },
  pool
);

app.use(
  session({
    key: 'connector.sid',
    secret: config.sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure
    }
  })
);

app.use((req, res, next) => {
  res.locals.error = req.session.error || '';
  res.locals.success = req.session.success || '';
  delete req.session.error;
  delete req.session.success;
  next();
});

function requireAuth(req, res, next) {
  if (!req.session.adminId) {
    return res.redirect('/login');
  }
  next();
}

app.get('/login', (req, res) => {
  if (req.session.adminId) {
    return res.redirect('/');
  }
  res.render('login');
});

app.post('/login', async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';

  if (!username || !password) {
    req.session.error = 'Укажите логин и пароль.';
    return res.redirect('/login');
  }

  const admin = await findAdminByUsername(username);
  if (!admin) {
    req.session.error = 'Неверные учетные данные.';
    return res.redirect('/login');
  }

  const isValid = await bcrypt.compare(password, admin.password_hash);
  if (!isValid) {
    req.session.error = 'Неверные учетные данные.';
    return res.redirect('/login');
  }

  req.session.adminId = admin.id;
  req.session.success = 'Вход выполнен успешно.';
  res.redirect('/');
});

app.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/', requireAuth, async (req, res) => {
  const subscriptions = await listSubscriptions();
  const total = await countSubscriptions();

  res.render('dashboard', {
    subscriptions,
    total,
    max: MAX_SUBSCRIPTIONS
  });
});

app.post('/subscriptions', requireAuth, async (req, res) => {
  const title = (req.body.title || '').trim();
  const url = (req.body.url || '').trim();

  if (!title || !url) {
    req.session.error = 'Заполните название и URL подписки.';
    return res.redirect('/');
  }

  try {
    new URL(url);
  } catch (error) {
    req.session.error = 'Неверный формат URL.';
    return res.redirect('/');
  }

  try {
    await addSubscription(title, url);
    req.session.success = 'Подписка добавлена.';
  } catch (error) {
    req.session.error = error.message;
  }

  res.redirect('/');
});

app.post('/subscriptions/:id/delete', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    req.session.error = 'Некорректный идентификатор.';
    return res.redirect('/');
  }

  await deleteSubscription(id);
  req.session.success = 'Подписка удалена.';
  res.redirect('/');
});

app.get('/combined', requireAuth, async (req, res) => {
  const subscriptions = await listSubscriptions();
  const payload = subscriptions.map((sub) => sub.url).join('\n');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(payload);
});

async function start() {
  await initDatabase();
  const generated = await ensureInitialAdmin();
  if (generated) {
    // one-time credentials on first start only
    console.log('=== Initial admin credentials (save once) ===');
    console.log(`Login: ${generated.username}`);
    console.log(`Password: ${generated.password}`);
    console.log('============================================');
  }

  app.listen(config.port, () => {
    console.log(`Connector panel started on port ${config.port}`);
  });
}

start().catch((error) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
