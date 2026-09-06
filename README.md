# Instagram Bridge Backend

NestJS asosidagi Instagram ↔ Telegram bridge. U Instagram webhooklarini Telegram'ga uzatadi va xavfsiz, tasdiqlangan Reel publish oqimini beradi.

Bu repozitoriydagi kod tashqi publish qilishni sukut bo'yicha o‘chirib qo‘yadi. Meta App Review, biznes verifikatsiyasi va serverdagi maxfiy sozlamalar yakunlanmaguncha uni production publish tizimi deb hisoblamang.

## Features

- **Instagram Webhook Integration:** Verifies webhook challenges and processes `media`, DM, comment and message events.
- **Telegram Integration:** Forwards incoming Instagram activity to a configured Telegram chat/topic.
- **Webhook Security:** Productionda `META_APP_SECRET` bo‘lmasa, imzosiz webhook qabul qilinmaydi.
- **Reel Publishing:** Public HTTPS video URL uchun `preview → container → status → publish` oqimi bor. U feature flag, private publish key va `confirmPublish: true` talab qiladi.
- **Safe Automation:** DM auto-reply ham sukut bo‘yicha o‘chirilgan.
- **Resilience:** Implements retry logic for Telegram API calls.
- **Dockerized:** Fully dockerized setup with PostgreSQL and optional pgAdmin.

## Architecture

- **Framework:** NestJS
- **Database:** PostgreSQL with TypeORM
- **Language:** TypeScript
- **Containerization:** Docker & Docker Compose

## Prerequisites

- Docker and Docker Compose
- Node.js 22+ va pnpm 11 (local development)
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
pnpm install --frozen-lockfile
```

Start PostgreSQL (using Docker):

```bash
docker-compose up db -d
```

Run the application:

```bash
pnpm run start:dev
```

## API Endpoints

- `GET /instagram/webhook`: Used by Facebook for verification (hub.challenge).
- `POST /instagram/webhook`: Receives webhook events.
- `POST /instagram/publish/reels`: Protected Reel preview/create endpoint.
- `POST /instagram/publish/reels/:containerId/complete`: Protected status/publish endpoint.

## Reel publish oqimi

Meta media faylni sizning serveringizdan emas, **public HTTPS URL** orqali yuklab oladi. Shu sababli lokal `data/videos` faylini to‘g‘ridan-to‘g‘ri yuborib bo‘lmaydi: avval uni ruxsat talab qilmaydigan public media hostga joylashtirish kerak.

Avval xavfsiz preview qiling. Bu Meta'ga so‘rov yubormaydi:

```bash
curl --request POST 'https://its.arxsolution.uz/instagram/publish/reels' \
  --header 'content-type: application/json' \
  --header 'x-instagram-publish-key: <serverdagi INSTAGRAM_PUBLISH_API_KEY>' \
  --data '{"videoUrl":"https://media.example.com/reel.mp4","caption":"Matn","confirmPublish":false}'
```

`confirmPublish: true` bo‘lsa, endpoint Meta'ga container yaratish va publish qilish uchun haqiqiy yozuvchi so‘rov yuboradi. U faqat quyidagilar tayyor bo‘lsa ishlaydi:

- `INSTAGRAM_PUBLISH_ENABLED=true`
- `INSTAGRAM_PUBLISH_API_KEY` (uzun, maxfiy qiymat)
- amal qiladigan `INSTAGRAM_ACCESS_TOKEN` va `INSTAGRAM_IG_USER_ID`
- Meta tomonidan tasdiqlangan content-publishing ruxsatlari

Meta video processing'ni hali tugatmagan bo‘lsa, javob `PROCESSING` va `containerId` qaytaradi. Shu ID bilan, tayyor bo‘lgach, alohida va aniq tasdiq bilan davom ettiring:

```bash
curl --request POST 'https://its.arxsolution.uz/instagram/publish/reels/<containerId>/complete' \
  --header 'content-type: application/json' \
  --header 'x-instagram-publish-key: <serverdagi INSTAGRAM_PUBLISH_API_KEY>' \
  --data '{"confirmPublish":true}'
```

`GET /health` hech qachon maxfiy qiymatlarni qaytarmaydi; u faqat `webhook`, `telegram` va `publishing` uchun tayyorlik holatini ko‘rsatadi.

## Meta production checklist

2026-09-06 dagi real app tekshiruvida `habarchi` uchun Instagram business ruxsatlari hali App Review orqali berilmagan, biznes verifikatsiyasi esa tugallanmagan. Bundan tashqari API `live` holatini ko‘rsatgan bo‘lsa-da, Developer UI app mode'ni `Development` deb ko‘rsatgan. Publish yoki mijozlar bilan live avtomatlashtirishdan oldin bularni moslashtiring:

1. Business verification'ni tugating.
2. Haqiqatan kerak bo‘lgan permissionlarni (kamida `instagram_business_basic` va `instagram_business_content_publish`; DM/comment flow ishlatilsa tegishli message/comment permissionlari) use case, screencast va data-use tavsifi bilan App Review'ga yuboring.
3. Callback URL va subscriptionlarni production serverda imzo tekshiruvi bilan sinang.
4. Long-lived token va `INSTAGRAM_PUBLISH_API_KEY`ni faqat server secret storage'ida saqlang; gitga qo‘shmang.
5. Har bir Reelni `confirmPublish: false` previewdan keyin alohida `confirmPublish: true` bilan yuboring.

## Verification

```bash
pnpm test --runInBand
pnpm run build
```

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
