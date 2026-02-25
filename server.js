import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import axios from "axios";

dotenv.config();

const app = express();

// ===== KONFIGURATSIYA =====
const CONFIG = {
  PORT:  3100,
  VERIFY_TOKEN: process.env.INSTAGRAM_VERIFY_TOKEN,
  APP_SECRET: process.env.META_APP_SECRET,
  PAGE_TOKEN: process.env.INSTAGRAM_ACCESS_TOKEN,
  TG_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TG_CHAT_ID: process.env.CHAT_ID,
  SKIP_SIG: process.env.SKIP_SIGNATURE === "1"
};

console.log({CONFIG})
// Raw body capture (Signature tekshirish uchun shart)
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// ===== YORDAMCHI FUNKSIYALAR =====

// 1. Instagramga javob yozish
async function sendInstagramMessage(recipientId, text) {
  if (!CONFIG.PAGE_TOKEN) return console.error("❌ PAGE_TOKEN topilmadi");
  try {
    const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${CONFIG.PAGE_TOKEN}`;
    await axios.post(url, {
      recipient: { id: recipientId },
      message: { text: text }
    });
    console.log(`✅ Javob yuborildi -> ${recipientId}`);
  } catch (e) {
    console.error("❌ Yuborishda xato:", e.response?.data || e.message);
  }
}

// 2. Telegramga xabar yuborish
async function sendToTelegram(text) {
  if (!CONFIG.TG_TOKEN) return;
  try {
    await axios.post(`https://api.telegram.org/bot${CONFIG.TG_TOKEN}/sendMessage`, {
      chat_id: CONFIG.TG_CHAT_ID,
      text: text.slice(0, 4000),
      disable_web_page_preview: true
    });
  } catch (e) {
    console.error("❌ Telegram error:", e.message);
  }
}

// 3. Xavfsizlikni tekshirish (Signature)
function verifySignature(req) {
  const signature = req.header("X-Hub-Signature-256");
  if (CONFIG.SKIP_SIG) return true;
  if (!signature || !CONFIG.APP_SECRET) return false;

  const hmac = crypto.createHmac("sha256", CONFIG.APP_SECRET);
  const digest = "sha256=" + hmac.update(req.rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

// ===== MARSHRUTLAR (ROUTES) =====

// A. Maxfiylik siyosati (Meta talabi uchun)
app.get("/privacy", (req, res) => {
  res.send(`
    <html>
      <body style="font-family: sans-serif; padding: 50px;">
        <h1>Privacy Policy for habarchi-IG</h1>
        <p>This app is used for automated customer support on Instagram.</p>
        <p>We do not store or share your personal data with third parties.</p>
        <p>Data is used only to process your messages in real-time.</p>
      </body>
    </html>
  `);
});

// B. Webhook Tasdiqlash (GET)
app.get("/instagram/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === CONFIG.VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// C. Xabarlarni qabul qilish (POST)
app.post("/instagram/webhook", async (req, res) => {
  if (!verifySignature(req)) {
    console.log("❌ Imzo xato!");
    return res.sendStatus(401);
  }

  const body = req.body;
  res.status(200).send("EVENT_RECEIVED"); // Meta'ga srazu javob beramiz

  if (body.object === "instagram") {
    for (const entry of body.entry) {

      // 1. Direct xabarlarni qayta ishlash
      if (entry.messaging) {
        for (const m of entry.messaging) {
          if (m.message && !m.message.is_echo) {
            const senderId = m.sender.id;
            const msgText = m.message.text || "[Media xabar]";

            console.log(`📩 Kelgan xabar: ${msgText}`);

            // Telegramga bildirishnoma
            await sendToTelegram(`🆕 Yangi xabar:\nKimdan: ${senderId}\nMatn: ${msgText}`);

            // AUTO-RESPONSE (Default javob)
            const replyText = "Assalomu alaykum! Xabaringizni oldik, operatorlarimiz tez orada bog'lanishadi. 😊";
            await sendInstagramMessage(senderId, replyText);
          }
        }
      }

      // 2. Izohlarni (Comments) qayta ishlash
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === "comments") {
            const commentText = change.value.text;
            const username = change.value.from.username;
            console.log(`💬 Izoh yozishdi (${username}): ${commentText}`);
            await sendToTelegram(`💬 Yangi izoh!\nUser: ${username}\nMatn: ${commentText}`);
          }
        }
      }
    }
  }
});

// ===== SERVERNI ISHGA TUSHIRISH =====
app.listen(CONFIG.PORT, () => {
  console.log(`🚀 Bot ${CONFIG.PORT}-portda tayyor!`);
  console.log(`🔗 Webhook URL: https://its.arxsolution.uz/instagram/webhook`);
  console.log(`📄 Privacy Policy: https://its.arxsolution.uz/privacy`);
});
