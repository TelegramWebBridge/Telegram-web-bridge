## Telegram Web K
Based on Webogram, patched and improved. Available for everyone here: https://web.telegram.org/k/


## Telegram Web Bridge (этот форк)

Форк [morethanwords/tweb](https://github.com/morethanwords/tweb), в котором клиент ходит не в Telegram, а в наш
FastAPI-бэкенд (MTProto-мост). Что изменено относительно upstream:

| Файл | Что |
|---|---|
| `src/lib/bridge/` | `endpoint.ts` (адрес бэка), `syncAccounts.ts` (забирает аккаунты и подсовывает fake-ключи), `client.ts` (один клиент на аккаунт) |
| `src/lib/mtproto/dcConfigurator.ts` | WebSocket URL ведёт на `/api/bridge/ws/<dc>/<type>` вместо `*.web.telegram.org` |
| `src/config/modes.ts` | PFS выключен, только WebSocket, без HTTP-транспорта |
| `src/index.ts` | вызов `syncBridgeAccounts()` до чтения стейта |
| `src/env.d.ts`, `vite.config.ts` | `VITE_BRIDGE_ORIGIN`, dev-порт 5173 и прокси `/api` → `localhost:3000` |

### Обновление форка с upstream

Один раз добавить remote:

```bash
git remote add upstream git@github.com:morethanwords/tweb.git
```

Дальше при каждом обновлении (работаем с чистым деревом, коммит или stash своего перед этим):

```bash
git fetch upstream
git merge upstream/master        # merge, не rebase: наши коммиты уже запушены в origin
```

Конфликты почти наверняка будут только в местах из таблицы выше, плюс два «шумных» места:

* `public/` — upstream коммитит туда собранный билд (коммиты «Build»). Содержимое нам не важно, мы собираем
  своё: бери любую сторону (`git checkout --theirs public && git add public`) и не вникай.
* `.env` — upstream меняет `VITE_VERSION`, `VITE_BUILD`, `VITE_LANG_PACK_VERSION`. Бери его значения, но **сохрани
  наши строки** (`VITE_BRIDGE_ORIGIN`).

После мержа:

```bash
pnpm install                     # зависимости могли поменяться
pnpm typecheck && pnpm test --run
```

И проверить глазами, что мост не сломан: в `dcConfigurator.ts` по-прежнему `bridgeWsUrl(...)`, в `modes.ts`
`pfs: false` / `http = false` / `transport = 'websocket'`, в `index.ts` на месте `await syncBridgeAccounts()`.
Если upstream переписал эти файлы — перенеси наши правки на новую версию руками. Потом `pnpm start` и
открыть `http://localhost:5173/?bridgeToken=...` (бэк должен быть запущен на `:3000`), затем `git push origin master`.

### Деплой

Схема: один домен, nginx раздаёт статику и проксирует `/api/` на бэкенд. Клиент и бэк на **одном origin**,
поэтому CORS не нужен и `VITE_BRIDGE_ORIGIN` в продакшен-билде остаётся **пустым**.

```
https://tg.example.com/        → статика (папка со сборкой)
https://tg.example.com/api/    → 127.0.0.1:3000  (FastAPI; включая WebSocket /api/bridge/ws/...)
```

#### 1. `.env` перед сборкой

`VITE_*` значения вшиваются в бандл на этапе сборки — поменял, значит пересобирай.

| Переменная | Значение |
|---|---|
| `VITE_BRIDGE_ORIGIN` | **пусто** — тогда клиент ходит на тот же хост, с которого загружен (`wss://tg.example.com/api/bridge/ws/...`). Заполнять только для прямого обращения к бэку на другом origin (тогда на бэке нужен CORS) |
| `VITE_API_ID`, `VITE_API_HASH` | уже стоят; должны совпадать с теми, что использует бэкенд |
| `VITE_VERSION`, `VITE_BUILD`, … | оставить как есть |

Токен доступа в `.env` не нужен: он передаётся в URL один раз — `https://tg.example.com/?bridgeToken=<token>` —
и запоминается в `localStorage` браузера (`bridge_token`).

#### 2. Сборка

```bash
pnpm install
pnpm build          # тесты + typecheck + vite build → dist/
```

Результат — `dist/`. Но `dist/` — **не вся** статика: в корень сайта нужны ещё файлы из `public/`
(`assets/`, `changelogs/`, `*.wasm`, воркеры `decoderWorker.min.*` и т.п. — всё, что vite не копирует,
`copyPublicDir: false`). Поэтому собираем итоговую папку так:

```bash
rm -rf deploy && mkdir deploy
cp -r public/. deploy/           # статические ассеты
cp -r dist/. deploy/             # свежий билд поверх
```

> Не используйте `node build` для ручного деплоя: он дополнительно инкрементит `VITE_BUILD` в `.env`, переписывает
> его целиком (комментарии теряются) и ходит за языковым пакетом. `pnpm build` ничего не трогает в `.env`.

Source maps включены (`sourcemap: true`); если не хочешь их публиковать — исключи при копировании
(`--exclude '*.map'` в rsync ниже).

#### 3. Копирование на сервер (rsync)

```bash
rsync -avz --delete --exclude '*.map' deploy/ user@server:/var/www/tg/
```

`--delete` убирает старые хешированные файлы, которых в новой сборке уже нет. Страница, открытая во время
копирования, может на секунду недогрузить чанк старой версии — лечится перезагрузкой.

Каталог на сервере: `sudo mkdir -p /var/www/tg && sudo chown user: /var/www/tg` (один раз).

#### 4. nginx

`/etc/nginx/sites-available/tg.example.com`:

```nginx
server {
    listen 80;
    server_name tg.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tg.example.com;

    ssl_certificate     /etc/letsencrypt/live/tg.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tg.example.com/privkey.pem;

    root /var/www/tg;
    index index.html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml application/wasm;

    # бэкенд: REST (/api/bridge/accounts) + WebSocket-реле (/api/bridge/ws/<dc>/<type>)
    location /api/ {
        proxy_pass http://127.0.0.1:3000;     # порт FastAPI
        proxy_http_version 1.1;

        # WebSocket
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # соединение с Telegram долгоживущее — не рвать его таймаутами по умолчанию (60 с)
        proxy_read_timeout  3600s;
        proxy_send_timeout  3600s;
        proxy_buffering     off;
        client_max_body_size 0;
    }

    # файлы с хешем в имени неизменяемы
    location ~* -[A-Za-z0-9_-]{8}\.(js|css|map|woff2?|wasm)$ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    # точка входа и всё, что не имеет хеша, — всегда свежее
    location / {
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /index.html;
    }
}
```

`$connection_upgrade` нужно объявить один раз в `http {}` (например, в `/etc/nginx/conf.d/ws.conf`):

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

Включить и проверить:

```bash
sudo ln -s /etc/nginx/sites-available/tg.example.com /etc/nginx/sites-enabled/
sudo certbot --nginx -d tg.example.com     # сертификат (HTTPS обязателен: без него нет wss, SW и крипто-API)
sudo nginx -t && sudo systemctl reload nginx
```

#### 5. Быстрый цикл ручного обновления

```bash
pnpm build
rm -rf deploy && mkdir deploy && cp -r public/. deploy/ && cp -r dist/. deploy/
rsync -avz --delete --exclude '*.map' deploy/ user@server:/var/www/tg/
```

Перезапускать nginx не нужно — это только статика. Бэкенд деплоится отдельно (другой репозиторий).
После обновления у пользователей новая версия подхватится при следующей загрузке страницы
(`index.html` не кешируется).

#### Проверка после деплоя

* `https://tg.example.com/` открывается, в Network нет 404 на `*.js`/`*.wasm`.
* `https://tg.example.com/api/bridge/accounts` отвечает от бэка, а не отдаёт `index.html` или 502 (код ответа без токена зависит от бэка).
* В DevTools → Network → WS соединение `wss://tg.example.com/api/bridge/ws/...` остаётся `101` и не рвётся через минуту.

### Developing
Install dependencies with:
```lang=bash
pnpm install
```
This will install all the needed dependencies.


#### Running web-server
Just run `pnpm start` to start the web server and the livereload task.
Open http://localhost:8080/ in your browser.


#### Running in production

Run `node build` to build the minimized production version of the app. Copy `public` folder contents to your web server.

### Running in docker

#### Developing: 
* Install dependencies `docker-compose up tweb.dependencies`.
* Run develop container `docker-compose up tweb.develop `.
* Open http://localhost:8080/ in your browser. 

#### Production:
* Run `docker-compose up tweb.production -d` nginx image and container to serve the build
* Open http://localhost:80/ in your browser.

You can use `docker build -f ./.docker/Dockerfile_production -t {dockerhub-username}/{imageName}:{latest} .` to build your production ready image.

### Dependencies
* [BigInteger.js](https://github.com/peterolson/BigInteger.js) ([Unlicense](https://github.com/peterolson/BigInteger.js/blob/master/LICENSE))
* [fflate](https://github.com/101arrowz/fflate) ([MIT License](https://github.com/101arrowz/fflate/blob/master/LICENSE))
* [cryptography](https://github.com/spalt08/cryptography) ([Apache License 2.0](https://github.com/spalt08/cryptography/blob/master/LICENSE))
* [emoji-data](https://github.com/iamcal/emoji-data) ([MIT License](https://github.com/iamcal/emoji-data/blob/master/LICENSE))
* [emoji-test-regex-pattern](https://github.com/mathiasbynens/emoji-test-regex-pattern) ([MIT License](https://github.com/mathiasbynens/emoji-test-regex-pattern/blob/main/LICENSE))
* [tlottie](https://github.com/dkaraush/tlottie) (MIT License)
* [fast-png](https://github.com/image-js/fast-png) ([MIT License](https://github.com/image-js/fast-png/blob/master/LICENSE))
* [opus-recorder](https://github.com/chris-rudmin/opus-recorder) ([BSD License](https://github.com/chris-rudmin/opus-recorder/blob/master/LICENSE.md))
* [Prism](https://github.com/PrismJS/prism) ([MIT License](https://github.com/PrismJS/prism/blob/master/LICENSE))
* [Solid](https://github.com/solidjs/solid) ([MIT License](https://github.com/solidjs/solid/blob/main/LICENSE))
* [TinyLD](https://github.com/komodojp/tinyld) ([MIT License](https://github.com/komodojp/tinyld/blob/develop/license))
* [libwebp.js](https://libwebpjs.appspot.com/)
* fastBlur
* [Mediabunny](https://github.com/Vanilagy/mediabunny) ([Mozilla Public License 2.0](https://github.com/Vanilagy/mediabunny/blob/main/LICENSE))
* [Temml](https://github.com/ronkok/Temml) ([MIT License](https://github.com/ronkok/Temml/blob/main/LICENSE))

### Debugging
You are welcome in helping to minimize the impact of bugs. There are classes, binded to global context. Look through the code for certain one and just get it by its name in developer tools.
Source maps are included in production build for your convenience.

#### Additional query parameters
* **test=1**: to use test DCs
* **debug=1**: to enable additional logging
* **noSharedWorker=1**: to disable Shared Worker, can be useful for debugging
* **http=1**: to force the use of HTTPS transport when connecting to Telegram servers

Should be applied like that: http://localhost:8080/?test=1

#### Taking local storage snapshots
You can also take and load snapshots of the local storage and indexed DB using the `./snapshot-server` [mini-app](/snapshot-server/README.md). Check the `README.md` under this folder for more details.

#### Preview all icons
You can see all the available svg icons by calling the `showIconLibrary()` global function in the browser's console.

### Troubleshooting & Suggesting

If you find an issue with this app or wish something to be added, let Telegram know using the [Suggestions Platform](https://bugs.telegram.org/c/4002).

### Licensing

The source code is licensed under GPL v3. License is available [here](/LICENSE).
