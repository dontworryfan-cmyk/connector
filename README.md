# Connector Panel (3x-UI subscriptions)

Панель объединяет до **10 подписок 3x-UI** в одном месте.

## Что реализовано

- Админ-панель с авторизацией.
- Автоматическая **разовая** генерация логина и пароля при первом запуске.
- Хранение учетной записи администратора и сессий в MySQL.
- Главное меню для добавления/удаления подписок (лимит 10).
- Эндпоинт `/combined` для получения объединенного списка URL подписок.
- Светлая тема (белый фон / черный текст) и ночной режим (темно-серый фон / белый текст).

---

## 1) Подготовка сервера

Пример рассчитан на Ubuntu 22.04+.

```bash
sudo apt update
sudo apt install -y nginx mysql-server curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Проверка версий:

```bash
node -v
npm -v
mysql --version
nginx -v
```

---

## 2) Установка проекта

```bash
cd /opt
sudo git clone <ВАШ_РЕПО_URL> connector
cd connector
npm install
cp .env.example .env
```

Откройте `.env` и укажите корректные параметры:

```env
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=connector
DB_PASSWORD=strong_password
DB_NAME=connector
SESSION_SECRET=replace_with_long_random_secret
COOKIE_SECURE=false
TIMEZONE=UTC
```

> Для production за Nginx обычно `COOKIE_SECURE=false`, если Node слушает только localhost, а HTTPS завершается на Nginx.

---

## 3) Настройка MySQL

Войти в MySQL:

```bash
sudo mysql
```

Создать базу и пользователя:

```sql
CREATE DATABASE connector CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'connector'@'127.0.0.1' IDENTIFIED BY 'strong_password';
GRANT ALL PRIVILEGES ON connector.* TO 'connector'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

---

## 4) Первый запуск и разовая генерация логина/пароля

```bash
cd /opt/connector
npm start
```

При **первом запуске** в логах появится блок:

- `Login: admin_xxxxxx`
- `Password: yyyyyy...`

Сохраните эти данные сразу. При последующих рестартах новые данные не генерируются.

Остановите процесс (`Ctrl+C`) и переходите к systemd.

---

## 5) Автозапуск через systemd

Создайте сервис:

```bash
sudo tee /etc/systemd/system/connector.service > /dev/null <<'UNIT'
[Unit]
Description=Connector Panel
After=network.target mysql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/connector
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/connector/src/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
```

Запуск:

```bash
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

## 6) Настройка Nginx (только панель)

Создайте конфиг:

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
```

Активируйте сайт:

```bash
sudo ln -s /etc/nginx/sites-available/connector.conf /etc/nginx/sites-enabled/connector.conf
sudo nginx -t
sudo systemctl reload nginx
```

Теперь панель доступна по `http://panel.example.com`.

---

## 7) Базовая эксплуатация и проверка

1. Открыть панель и войти под сгенерированным логином/паролем.
2. Добавить до 10 подписок (Название + URL).
3. Проверить удаление подписки.
4. Открыть `/combined` для итогового объединенного списка URL.
5. Переключить тему кнопкой «Сменить тему».

---

## 8) Рекомендации для production

- Обязательно включите HTTPS (например, Let's Encrypt).
- Ограничьте доступ к серверу по firewall.
- Регулярно делайте бэкап MySQL.
- Меняйте пароль администратора через SQL при необходимости.
- Используйте отдельного системного пользователя вместо `root` в systemd.

---

## 9) Быстрый SQL-сброс администратора (опционально)

Если нужно сбросить доступ, можно удалить администратора и перезапустить сервис.

```sql
USE connector;
DELETE FROM admins;
```

После перезапуска (`sudo systemctl restart connector`) будут сгенерированы новые одноразовые учетные данные.
