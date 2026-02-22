import axios from "axios";
import crypto from "crypto";
import express from "express";

const app = express();

// ====== ENV ======
const PORT = process.env.PORT || 3100;
const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN || "";
const META_APP_SECRET = process.env.META_APP_SECRET || "";

// Telegram (ixtiyoriy)
const TG_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT_ID = process.env.CHAT_ID || ""; // sen ConfigService’da CHAT_ID ishlatgansan

// ====== Helpers ======
function truncate(str, max = 6000) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "…(truncated)" : str;
}

function safeHeaders(headers) {
  const h = { ...headers };
  if (h.authorization) h.authorization = "***";
  if (h.cookie) h.cookie = "***";
  return h;
}

async function telegramSend(text) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      chat_id: TG_CHAT_ID,
      text: truncate(text, 3500),
      disable_web_page_preview: true,
    });
  } catch (e) {
    console.error("Telegram send failed:", e?.response?.data || e?.message);
  }
}

// ====== Raw body capture middleware ======
// Biz express.json() ni verify bilan ishlatamiz: req.rawBody = Buffer
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

// ====== Signature check ======
function verifyMetaSignature(req) {
  // Meta Webhooks: X-Hub-Signature-256: sha256=<hex>
  const signature = req.header("X-Hub-Signature-256");

  // GET verify’da signature bo‘lmaydi
  if (req.method === "GET") return true;

  if (!META_APP_SECRET) {
    // Secret qo‘yilmagan bo‘lsa, tekshirishni o‘chirib turish mumkin
    console.warn("META_APP_SECRET is empty — signature check skipped!");
    return true;
  }

  if (!signature) return false;

  const raw = req.rawBody || Buffer.from("");
  const expected =
    "sha256=" + crypto.createHmac("sha256", META_APP_SECRET).update(raw).digest("hex");

  // timing-safe compare
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ====== Route: GET verify ======
app.get("/instagram/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("=== IG WEBHOOK VERIFY (GET) ===");
  console.log("TIME:", new Date().toISOString());
  console.log("QUERY:", req.query);

  if (mode === "subscribe" && token && token === VERIFY_TOKEN) {
    console.log("VERIFY OK ✅");
    return res.status(200).send(challenge || "");
  }

  console.log("VERIFY FAILED ❌");
  return res.status(400).send("Invalid verify token");
});

// ====== Route: POST webhook ======
app.post("/instagram/webhook", async (req, res) => {
  const ok = verifyMetaSignature(req);

  // Har doim log — ko‘rinmayapti degan muammo uchun
  console.log("=============== WEBHOOK HIT ===============");
  console.log("TIME:", new Date().toISOString());
  console.log("METHOD:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("SIGNATURE OK:", ok ? "YES ✅" : "NO ❌");
  console.log("HEADERS:", safeHeaders(req.headers));

  const raw = req.rawBody ? req.rawBody.toString("utf8") : "";
  console.log("RAW BODY:", truncate(raw, 8000));
  console.log("PARSED BODY:", truncate(JSON.stringify(req.body), 8000));

  if (!ok) {
    console.log("❌ Invalid signature. Returning 401.");
    console.log("===========================================");
    return res.status(401).send("Invalid signature");
  }

  // Kelayotgan hamma eventlarni maydalab loglaymiz
  try {
    const event = req.body;

    console.log("========== IG EVENT START ==========");
    console.log("object:", event?.object ?? "N/A");

    const entries = event?.entry;
    if (!Array.isArray(entries)) {
      console.log("event.entry missing or not array");
    } else {
      console.log("entry count:", entries.length);

      entries.forEach((entry, idx) => {
        console.log(`--- ENTRY[${idx}] ---`);
        console.log(truncate(JSON.stringify(entry), 9000));

        // Graph changes
        if (Array.isArray(entry?.changes)) {
          console.log(`ENTRY[${idx}] changes count: ${entry.changes.length}`);
          entry.changes.forEach((ch, cidx) => {
            console.log(`  - CHANGE[${cidx}] field=${ch?.field ?? "N/A"}`);
            console.log(`    value: ${truncate(JSON.stringify(ch?.value), 9000)}`);
          });
        }

        // Messaging
        if (Array.isArray(entry?.messaging)) {
          console.log(`ENTRY[${idx}] messaging count: ${entry.messaging.length}`);
          entry.messaging.forEach((m, midx) => {
            const sender = m?.sender?.id;
            const recipient = m?.recipient?.id;
            const text = m?.message?.text;
            const mid = m?.message?.mid;

            console.log(
              `  - MSG[${midx}] sender=${sender ?? "N/A"} recipient=${recipient ?? "N/A"} mid=${mid ?? "N/A"}`
            );
            if (text) console.log(`    text: ${truncate(String(text), 3000)}`);
            console.log(`    payload: ${truncate(JSON.stringify(m), 9000)}`);
          });
        }

        if (!entry?.changes && !entry?.messaging) {
          console.log(`ENTRY[${idx}] unknown format (no changes[], no messaging[])`);
        }
      });
    }

    console.log("========== IG EVENT END ==========");

    // Telegramga ham yuborib turamiz (ixtiyoriy)
    await telegramSend(`IG webhook hit ✅\nobject=${event?.object ?? "N/A"}\nraw=${truncate(raw, 3000)}`);

    // Meta webhook: 200 qaytarsang bo‘ldi
    console.log("===========================================");
    return res.status(200).send("EVENT_RECEIVED");
  } catch (err) {
    console.error("Error processing webhook:", err?.stack || err?.message || err);
    console.log("===========================================");
    return res.status(200).send("EVENT_RECEIVED"); // Meta qayta-qayta urmasin
  }
});

// ====== Start ======
app.listen(PORT, () => {
  console.log(`✅ Express listening on :${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/instagram/webhook`);
});
