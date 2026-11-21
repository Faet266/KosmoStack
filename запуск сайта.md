# Установка и запуск KosmoStack

## 1. Установите программы

- **Node.js 24 LTS с npm**. Используется для сборки и запуска сайта. [Установщик Node.js](https://nodejs.org/en/download)
- **PostgreSQL 17**. Приложение проверено на PostgreSQL 17.12. При установке запомните пароль администратора `postgres`. [Установщик PostgreSQL](https://www.postgresql.org/download/)
- **Python 3.13** для PDF и DOCX, а также для проверки совместимости результатов подготовленного корпуса. [Установщик Python](https://www.python.org/downloads/)
- **Ollama** для чата и перевода. Для остальных функций сайт можно запустить до установки Ollama. [Установщик Ollama](https://ollama.com/download)

Для первой установки зависимостей нужен интернет. Распакуйте ZIP, откройте терминал в папке `KosmoStack` рядом с `package.json` и проверьте, что команда `node --version` показывает версию 24.x.

## 2. Создайте базу PostgreSQL

Запустите службу PostgreSQL. В Windows запустите **SQL Shell (psql)** из меню «Пуск». Подключитесь к адресу `localhost`, порту `5432`, базе `postgres` под пользователем `postgres`. В macOS и Linux используйте доступный вам административный вход в PostgreSQL.

Выполните в psql, заменив `MyLocalPass_42` своим паролем. Для первого запуска проще выбрать пароль из латинских букв, цифр и подчёркивания.

```sql
CREATE ROLE kosmostack LOGIN PASSWORD 'MyLocalPass_42';
CREATE DATABASE kosmostack OWNER kosmostack ENCODING 'UTF8' TEMPLATE template0;
```

При первом обращении к базе приложение применит SQL-миграции из папки `db/`. Отдельная команда для миграции в чистой установке не нужна.

## 3. Настройте проект и установите зависимости

В **PowerShell** на Windows:

```powershell
Copy-Item .env.example .env.local
npx.cmd --yes pnpm@12.3.4 install --frozen-lockfile
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-report.txt
```

В **macOS или Linux**:

```sh
cp .env.example .env.local
npx --yes pnpm@12.3.4 install --frozen-lockfile
python3.13 -m venv .venv
./.venv/bin/python -m pip install -r requirements-report.txt
```

Откройте `.env.local` и укажите пароль, который задали в PostgreSQL. Добавьте путь к Python из виртуального окружения:

```dotenv
DATABASE_URL=postgresql://kosmostack:MyLocalPass_42@127.0.0.1:5432/kosmostack
RAG_PYTHON=./.venv/Scripts/python.exe
```

В macOS и Linux замените значение `RAG_PYTHON` на `./.venv/bin/python`. Если в пароле есть специальные символы URL, их нужно закодировать. Если при экспорте PDF приложение не находит шрифт, добавьте в `.env.local` строку `PDF_REPORT_FONT=` с путём к файлу TTF, поддерживающему кириллицу, например к Arial или DejaVu Sans.

OCR сайта входит в JavaScript-зависимости. Отдельная установка Tesseract для загрузки PDF в веб-интерфейсе не требуется.

## 4. Соберите и запустите

Windows PowerShell:

```powershell
npm.cmd run build
npm.cmd run start -- --hostname 127.0.0.1 --port 3000
```

В macOS/Linux используйте `npm` вместо `npm.cmd`. Для запуска в режиме разработки выполните `npm run dev -- --hostname 127.0.0.1 --port 3000`.

Откройте [KosmoStack](http://127.0.0.1:3000/). Введите ФИО и почту. Нажмите «Получить код» и введите шесть цифр, которые сайт покажет под полем. SMTP для локального входа не используется. Код на экране не подтверждает владение почтовым адресом. Сервер в этой конфигурации доступен с того же устройства. Остановка сервера выполняется сочетанием **Ctrl+C**.

## 5. Подключите ассистента при необходимости

Запустите Ollama. На Windows и macOS приложение обычно запускается отдельно. Если сервер не запущен, выполните `ollama serve` в отдельном терминале. Затем загрузите модель:

```text
ollama pull qwen2.5:3b
```

Сайт по умолчанию подключается к `http://127.0.0.1:11434`. При необходимости задайте `OLLAMA_URL` и `OLLAMA_MODEL` в `.env.local` и перезапустите сайт.

## 6. Добавьте данные

**Для быстрого показа.** Откройте «Личный кабинет», создайте область, перетащите в неё свои PDF и дождитесь завершения анализа. Проверьте теги, страницы публикации и выгрузку анализа. Локальные данные создаются в `data/uploads` и `data/auth.sqlite`.

**Для заполнения встроенных областей.** Готовые материалы подключаются отдельно. Простой импорт своих PDF через кабинет создаёт личную область.

- **RAG.** Укажите `RAG_QUALITY_RUN_DIR` до папки с `handoff/` и файлами `pipeline.json`, `checker.json`, `score.json`. В `RAG_SOURCE_DIR` укажите папку с манифестом и извлечёнными страницами, в `RAG_CORPUS_DIR` — папку с оригинальными PDF. Откройте вкладку RAG после перезапуска сайта для автоматического импорта проверенной выгрузки в PostgreSQL.
- **Солнечные элементы.** Для пакетной индексации укажите `SOLAR_CORPUS_DIR` до исходных PDF и `SOLAR_SOURCE_DIR` до подготовленных страниц с манифестом.
- **Космос.** Для штатного пакетного импорта индекса нужны снимки NASA NTRS и Crossref в `data/research/` либо обновление из открытых источников. При наличии подготовленных материалов Solar и после импорта RAG можно выполнить из корня проекта:

```text
node --env-file=.env.local scripts/research-index.mjs --refresh-open
node --env-file=.env.local scripts/index-space-pdfs.mjs
node --env-file=.env.local scripts/enrich-research-citations.mjs
```

Команда с `--refresh-open` обращается к NASA NTRS и Crossref и пересобирает индексы встроенных областей. Вторая команда загружает доступные PDF NASA и индексирует их страницы. Общие материалы по формату выгрузки доступны в [документации инструментов качества](tools/quality/docs/QUALITY-HANDOFF.md).

## Если не запускается

| Симптом | Что проверить |
| --- | --- |
| Кабинет сообщает об ошибке подключения к БД | Служба PostgreSQL работает, порт и пароль в `.env.local` совпадают с настройками. |
| PDF/DOCX не скачивается | `RAG_PYTHON` указывает на Python, в который установлены пакеты из `requirements-report.txt`. Для PDF доступен TTF с кириллицей. |
| Чат сообщает, что модель недоступна | Ollama запущена на том же устройстве, а `ollama list` показывает выбранную модель. |
| Встроенная область пуста | Нужны подготовленные материалы этой области. Для работы с собственными PDF откройте личный кабинет. |
| Порт 3000 занят | Укажите другой свободный порт в команде запуска и откройте тот же порт в браузере. |
