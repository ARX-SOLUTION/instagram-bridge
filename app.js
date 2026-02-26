import crypto from "crypto";
import express from "express";

const app = express();

const PORT = process.env.PORT || 3100;
const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN || "";
const META_APP_SECRET = process.env.META_APP_SECRET || "";

// Telegram config
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.CHAT_ID || "";

app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Telegram guruhiga xabar yuborish uchun funksiya
async function sendToTelegramGroup(messageHtml) {
  if (!TELEGRAM_BOT_TOKEN || !CHAT_ID) {
    console.warn("TELEGRAM_BOT_TOKEN yoki CHAT_ID kiritilmagan!");
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: messageHtml,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!response.ok) {
      console.error("Telegram ga yuborishda xatolik:", await response.text());
    }
  } catch (err) {
    console.error("Telegram bilan aloqa xatosi:", err);
  }
}

function verifyMetaSignature(req) {
  const signature = req.header("X-Hub-Signature-256");

  if (req.method === "GET") return true;

  if (!META_APP_SECRET) {
    console.warn("META_APP_SECRET is empty — signature check skipped!");
    return true;
  }

  if (!signature) return false;

  const raw = req.rawBody || Buffer.from("");
  const expected = "sha256=" + crypto.createHmac("sha256", META_APP_SECRET).update(raw).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

app.get("/instagram/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("VERIFY OK ✅");
    return res.status(200).send(challenge || "");
  }

  console.error("VERIFY FAILED ❌");
  return res.status(400).send("Invalid verify token");
});

app.post("/instagram/webhook", (req, res) => {
  if (!verifyMetaSignature(req)) {
    console.error("❌ Invalid signature.");
    return res.status(401).send("Invalid signature");
  }

  try {
    const event = req.body;
    console.log("========== IG EVENT ==========");
    console.log(JSON.stringify(event, null, 2));

    // Telegram guruhiga yuborish logikasi
    if (event.entry && Array.isArray(event.entry)) {
      for (const entry of event.entry) {

        // 1. Commentlar va mentionlar
        if (entry.changes && Array.isArray(entry.changes)) {
          for (const change of entry.changes) {
            const value = change.value;
            if (value && value.from) {
              const username = value.from.username;
              const text = value.text || "Media/Boshqa narsa";

              // Username orqali Instagram profiliga havola (link)
              const userLink = username
                  ? `<a href="https://instagram.com/${username}">${username}</a>`
                  : `<a href="https://instagram.com/">Foydalanuvchi ID: ${value.from.id}</a>`;

              const tgMsg = `<b>Yangi bildirishnoma (Instagram)</b>\nKimdan: ${userLink}\n\nXabar: ${text}`;
              sendToTelegramGroup(tgMsg);
            }
          }
        }

        // 2. Direct xabarlar (DM)
        if (entry.messaging && Array.isArray(entry.messaging)) {
          for (const msg of entry.messaging) {
            if (msg.sender) {
              const senderId = msg.sender.id;
              // DM webhook orqali ko'pincha username kelmaydi. Agar mavjud bo'lsa ishlatamiz.
              const username = msg.sender.username;
              const text = msg.message ? msg.message.text : "Media/Boshqa narsa";

              const userLink = username
                  ? `<a href="https://instagram.com/${username}">${username}</a>`
                  : `<a href="https://instagram.com/">ID: ${senderId}</a>`;

              const tgMsg = `<b>Yangi xabar (Instagram DM)</b>\nKimdan: ${userLink}\n\nXabar: ${text}`;
              sendToTelegramGroup(tgMsg);
            }
          }
        }
      }
    }

    return res.status(200).send("EVENT_RECEIVED");
  } catch (err) {
    console.error("Error processing webhook:", err.message || err);
    return res.status(200).send("EVENT_RECEIVED");
  }
});

app.listen(PORT, () => {
  console.log(`✅ Express listening on :${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/instagram/webhook`);
});

