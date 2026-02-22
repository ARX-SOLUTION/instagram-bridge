# Instagram Bridge Backend

A production-ready NestJS backend that bridges Instagram Webhooks to Telegram. It receives new posts from Instagram, stores them in PostgreSQL, and forwards them to a Telegram bot.

## Features

- **Instagram Webhook Integration:** Verifies webhook challenges and processes `media` events.
- **Telegram Integration:** Forwards new posts (Image/Video/Album) to a specified Telegram Chat/Channel.
- **Database Storage:** Stores post metadata in PostgreSQL with idempotency checks.
- **Resilience:** Implements retry logic for Telegram API calls.
- **Dockerized:** Fully dockerized setup with PostgreSQL and optional pgAdmin.

## Architecture

- **Framework:** NestJS
- **Database:** PostgreSQL with TypeORM
- **Language:** TypeScript
- **Containerization:** Docker & Docker Compose

## Prerequisites

- Docker and Docker Compose
- Node.js (for local development)
- Telegram Bot Token and Chat ID
- Instagram Graph API Access Token and Verify Token

## Getting Started

### 1. Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

Fill in the required variables in `.env`:

- `TELEGRAM_BOT_TOKEN`: From BotFather.
- `TELEGRAM_CHAT_ID`: ID of the target chat/channel.
- `INSTAGRAM_ACCESS_TOKEN`: Long-lived access token for Instagram Graph API.
- `INSTAGRAM_VERIFY_TOKEN`: A random string you set in Facebook Developer Portal.

### 2. Run with Docker

Build and start the services:

```bash
docker-compose up --build -d
```

The API will be available at `http://localhost:3000`.

### 3. Setup Instagram Webhook

1.  Expose your local server using ngrok (or similar):
    ```bash
    ngrok http 3000
    ```
2.  Go to the Facebook Developer Portal > Webhooks.
3.  Select "Instagram" object.
4.  Click "Edit Subscription".
5.  **Callback URL:** `https://<your-ngrok-url>/instagram/webhook`
6.  **Verify Token:** The value of `INSTAGRAM_VERIFY_TOKEN` in your `.env`.
7.  Verify and Save.

### 4. Development (Local)

Install dependencies:

```bash
npm install
```

Start PostgreSQL (using Docker):

```bash
docker-compose up db -d
```

Run the application:

```bash
npm run start:dev
```

## API Endpoints

- `GET /instagram/webhook`: Used by Facebook for verification (hub.challenge).
- `POST /instagram/webhook`: Receives webhook events.
- `POST /instagram/webhook/send-message`: Sends a Telegram message to a specific chat ID.

## Production URL bo'yicha tezkor yo'riqnoma

Loyiha productionda quyidagi domen ostida ishlaydi:

- `https://its.arxsolution.uz`

### 1) Health tekshirish

```bash
curl --location 'https://its.arxsolution.uz/health'
```

Kutilgan natija: server ishlayotgan bo'lsa, health endpoint javob qaytaradi.

### 2) Telegram'ga xabar yuborish

Quyidagi endpoint orqali ixtiyoriy chat/channel'ga xabar yuborishingiz mumkin:

```bash
curl --location 'https://its.arxsolution.uz/instagram/webhook/send-message' \
--header 'Content-Type: application/json' \
--data '{
  "chatId": "-1003814144946",
  "message": "Xabar matni"
}'
```

Kutilgan muvaffaqiyatli javob:

```text
Message sent successfully
```

### 3) Instagram webhook verify sozlash (Facebook Developer Portal)

- **Callback URL:** `https://its.arxsolution.uz/instagram/webhook`
- **Verify Token:** `.env` dagi `INSTAGRAM_VERIFY_TOKEN` bilan bir xil bo'lishi kerak.

Webhook verify testi uchun:

```bash
curl "https://its.arxsolution.uz/instagram/webhook?hub.mode=subscribe&hub.verify_token=<VERIFY_TOKEN>&hub.challenge=123456"
```

Agar token to'g'ri bo'lsa, javobda `123456` qaytadi.

### 4) Muammo bo'lsa tekshirish ro'yxati

- `chatId` to'g'ri ekanini tekshiring (kanal/guruh uchun odatda manfiy son bo'ladi).
- `TELEGRAM_BOT_TOKEN` serverda sozlangan bo'lishi kerak.
- Bot chatga qo'shilgan va xabar yuborish huquqi borligini tekshiring.
- 400 xato chiqsa, request body'da `chatId` va `message` mavjudligini tekshiring.

## Database Schema

**InstagramPost Entity:**
- `id`: UUID (Primary Key)
- `mediaId`: String (Unique, Indexed)
- `caption`: Text
- `mediaUrl`: Text
- `createdAt`: Timestamp (Indexed)
- `forwarded`: Boolean

## Monitoring

- **Logs:** Application logs are output to stdout/stderr (view with `docker-compose logs -f api`).
- **pgAdmin:** Available at `http://localhost:5050` (Email: `admin@admin.com`, Password: `admin`).

## License

UNLICENSED
