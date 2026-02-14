# Connector — панель объединения подписок 3x-UI

Проект пересобран как рабочий аналог идеи `nginx-3x-ui-subscription-proxy`, но с полноценной **веб-админкой с авторизацией**.

## Что умеет

- Авторизация в админку.
- Автоматическая **одноразовая генерация** admin логина/пароля при первом запуске.
- Хранение admin-учетки, сессий, источников и токена подписки в MySQL.
- Добавление/удаление/включение/выключение источников подписок.
- Ограничение: максимум **10** источников.
- Эндпоинт объединенной подписки: `/sub/<token>`.
- Объединение происходит сервером: он скачивает все включенные источники, извлекает URI (`vmess://`, `vless://`, `trojan://`, `ss://`, ...), удаляет дубли и отдает результат в base64.
- Светлая тема (белая) и ночная тема (темно-серая).

---

## Архитектура

- `Node.js` — backend + GUI (Express, EJS).
- `MySQL` — хранение данных и сессий.
- `Nginx` — reverse proxy для панели и feed URL.

---

## 1. Установка зависимостей на сервер

```bash
sudo apt update
sudo apt install -y nginx mysql-server curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Проверка:

```bash
node -v
npm -v
mysql --version
nginx -v
```

---

## 2. Развертывание проекта

```bash
cd /opt
sudo git clone <YOUR_REPO_URL> connector
cd connector
npm install
cp .env.example .env
```

Откройте `.env`:

```env
PORT=3000
APP_BASE_URL=https://panel.example.com
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=connector
DB_PASSWORD=change_me
DB_NAME=connector
SESSION_SECRET=change_me_to_long_random_value
COOKIE_SECURE=true
REQUEST_TIMEOUT_MS=15000
```

Пояснения:

- `APP_BASE_URL` — внешний адрес панели (с доменом и https), нужен для генерации итогового URL подписки.
- `COOKIE_SECURE=true` используйте при HTTPS через Nginx.

---

## 3. Настройка MySQL

```bash
sudo mysql
```

```sql
CREATE DATABASE connector CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'connector'@'127.0.0.1' IDENTIFIED BY 'change_me';
GRANT ALL PRIVILEGES ON connector.* TO 'connector'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

---

## 4. Первый запуск и получение admin-доступа

```bash
cd /opt/connector
npm start
```

При первом запуске в логе появится одноразовый блок:

- `Login: admin_xxxxxx`
- `Password: xxxxxxxxxxxxx`

Также в логе будет общий URL подписки вида:

- `Subscription URL: https://panel.example.com/sub/<token>`

Сохраните эти данные.

---

## 5. Запуск через systemd

Создайте unit-файл:

```bash
sudo tee /etc/systemd/system/connector.service > /dev/null <<'UNIT'
[Unit]
Description=Connector Panel (3x-UI merger)
After=network.target mysql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/connector
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/connector/src/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
```

Подготовьте права и запустите:

```bash
sudo chown -R www-data:www-data /opt/connector
sudo systemctl daemon-reload
sudo systemctl enable connector
sudo systemctl start connector
sudo systemctl status connector --no-pager
```

Логи:

```bash
sudo journalctl -u connector -f
```

---

## 6. Настройка Nginx (только панель)

```bash
sudo tee /etc/nginx/sites-available/connector.conf > /dev/null <<'NGINX'
server {
    listen 80;
    server_name panel.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

sudo ln -s /etc/nginx/sites-available/connector.conf /etc/nginx/sites-enabled/connector.conf
sudo nginx -t
sudo systemctl reload nginx
```

После этого:

- Панель: `http://panel.example.com/login`
- Подписка: `http://panel.example.com/sub/<token>`

---

## 7. HTTPS (рекомендуется)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d panel.example.com
```

После выдачи сертификата убедитесь, что в `.env`:

- `APP_BASE_URL=https://panel.example.com`
- `COOKIE_SECURE=true`

И перезапустите:

```bash
sudo systemctl restart connector
```

---

## 8. Работа в админке

1. Войти в `/login`.
2. Добавить до 10 источников.
3. При необходимости выключить отдельные источники (без удаления).
4. Скопировать общий feed URL и использовать его в клиенте.
5. Переключать темы кнопкой `Тема`.

---

## 9. Сброс доступа

### Сброс admin-учетки

```sql
USE connector;
DELETE FROM admins;
```

После `sudo systemctl restart connector` будут сгенерированы новые one-time учетные данные.

### Сброс feed токена

```sql
USE connector;
DELETE FROM feed_tokens;
```

После рестарта будет сгенерирован новый token.

---

## 10. Частые проблемы

- `Invalid token` на `/sub/...` → используйте актуальный token из админки/логов.
- Пустая подписка → проверьте, что источники включены и отдают валидные URI.
- Ошибка входа в панель → проверьте `.env`, MySQL и логи `journalctl -u connector -f`.
