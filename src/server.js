const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const bcrypt = require('bcryptjs');

const config = require('./config');
const { pool, initDatabase } = require('./db');
const { ensureInitialAdmin, findAdminByUsername } = require('./auth');
const { ensureFeedToken, findFeedToken, mergeSubscriptions } = require('./feed');
const {
  MAX_SUBSCRIPTIONS,
  listSubscriptions,
  countSubscriptions,
  createSubscription,
  deleteSubscription,
  toggleSubscription,
  listEnabledUrls
} = require('./subscriptions');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use('/static', express.static(path.join(__dirname, 'public')));

const sessionStore = new MySQLStore(
  {
    createDatabaseTable: true,
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 24 * 60 * 60 * 1000
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
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      maxAge: 24 * 60 * 60 * 1000
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
  return res.render('login');
});

app.post('/login', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!username || !password) {
      req.session.error = 'Введите логин и пароль.';
      return res.redirect('/login');
    }

    const admin = await findAdminByUsername(username);
    if (!admin) {
      req.session.error = 'Неверный логин или пароль.';
      return res.redirect('/login');
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      req.session.error = 'Неверный логин или пароль.';
      return res.redirect('/login');
    }

    req.session.adminId = admin.id;
    req.session.success = 'Авторизация выполнена.';
    return res.redirect('/');
  } catch (error) {
    return next(error);
  }
});

app.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/', requireAuth, async (req, res, next) => {
  try {
    const subscriptions = await listSubscriptions();
    const token = await ensureFeedToken();

    return res.render('dashboard', {
      subscriptions,
      total: subscriptions.length,
      max: MAX_SUBSCRIPTIONS,
      feedUrl: `${config.appBaseUrl}/sub/${token}`
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/subscriptions', requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const sourceUrl = String(req.body.sourceUrl || '').trim();

    if (!name || !sourceUrl) {
      req.session.error = 'Заполните название и URL.';
      return res.redirect('/');
    }

    try {
      new URL(sourceUrl);
    } catch (error) {
      req.session.error = 'Некорректный URL подписки.';
      return res.redirect('/');
    }

    await createSubscription(name, sourceUrl);
    req.session.success = 'Подписка добавлена.';
    return res.redirect('/');
  } catch (error) {
    req.session.error = error.message;
    return res.redirect('/');
  }
});

app.post('/subscriptions/:id/delete', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      req.session.error = 'Некорректный идентификатор.';
      return res.redirect('/');
    }

    await deleteSubscription(id);
    req.session.success = 'Подписка удалена.';
    return res.redirect('/');
  } catch (error) {
    return next(error);
  }
});

app.post('/subscriptions/:id/toggle', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const enabled = req.body.enabled === '1';

    if (!Number.isInteger(id) || id < 1) {
      req.session.error = 'Некорректный идентификатор.';
      return res.redirect('/');
    }

    await toggleSubscription(id, enabled);
    req.session.success = enabled ? 'Подписка включена.' : 'Подписка отключена.';
    return res.redirect('/');
  } catch (error) {
    return next(error);
  }
});

app.get('/sub/:token', async (req, res, next) => {
  try {
    const token = String(req.params.token || '');
    const exists = await findFeedToken(token);

    if (!exists) {
      return res.status(403).type('text/plain').send('Invalid token');
    }

    const urls = await listEnabledUrls();
    const merged = await mergeSubscriptions(urls, config.requestTimeoutMs);

    return res
      .status(200)
      .set('Content-Type', 'text/plain; charset=utf-8')
      .set('Cache-Control', 'no-store')
      .send(merged);
  } catch (error) {
    return next(error);
  }
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  if (res.headersSent) {
    return next(error);
  }
  return res.status(500).type('text/plain').send('Internal server error');
});

async function start() {
  await initDatabase();
  const generatedAdmin = await ensureInitialAdmin();
  const token = await ensureFeedToken();

  if (generatedAdmin) {
    console.log('=== One-time admin credentials ===');
    console.log(`Login: ${generatedAdmin.username}`);
    console.log(`Password: ${generatedAdmin.password}`);
    console.log('==================================');
  }

  console.log(`Subscription URL: ${config.appBaseUrl}/sub/${token}`);

  app.listen(config.port, () => {
    console.log(`Connector started on port ${config.port}`);
  });
}

start().catch((error) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
