import crypto from 'crypto';
import express from 'express';
import fs from 'fs';

const app = express();
const processedMessages = new Map();
const PROCESSED_TTL_MS = 10 * 60 * 1000;
const PROCESSED_MAX_SIZE = 5000;
const TOPIC_CACHE_PATH =
  process.env.TELEGRAM_TOPIC_CACHE_PATH || '.telegram-topic-cache.json';

const PORT = process.env.PORT || 3100;
const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';

// Telegram config
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.CHAT_ID || '';
const MY_IG_ID = process.env.INSTAGRAM_IG_USER_ID || '17841420906468205';
const ENABLE_FORUM_TOPICS =
  (process.env.TELEGRAM_ENABLE_TOPICS || 'true').toLowerCase() !== 'false';
const topicThreadCache = new Map();
let forumAvailable = true;
let forumFallbackLogged = false;

function readTopicCache() {
  try {
    if (!fs.existsSync(TOPIC_CACHE_PATH)) return;
    const raw = fs.readFileSync(TOPIC_CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    for (const [key, value] of Object.entries(parsed || {})) {
      const threadId = Number(value);
      if (Number.isInteger(threadId) && threadId > 0) {
        topicThreadCache.set(key, threadId);
      }
    }
  } catch (err) {
    console.error("Topic cache o'qishda xatolik:", err);
  }
}

function writeTopicCache() {
  try {
    const data = Object.fromEntries(topicThreadCache.entries());
    fs.writeFileSync(TOPIC_CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Topic cache yozishda xatolik:', err);
  }
}

readTopicCache();

app.use(
  express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

app.use(
  express.urlencoded({
    extended: true,
    limit: '10mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);

async function telegramApiCall(method, payload) {
  if (!TELEGRAM_BOT_TOKEN || !CHAT_ID) {
    console.warn('TELEGRAM_BOT_TOKEN yoki CHAT_ID kiritilmagan!');
    return { ok: false, description: 'Telegram config missing' };
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    let body = null;
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }

    if (!response.ok || !body?.ok) {
      return {
        ok: false,
        description: body?.description || raw || `HTTP ${response.status}`,
      };
    }

    return { ok: true, result: body.result };
  } catch (err) {
    console.error('Telegram bilan aloqa xatosi:', err);
    return { ok: false, description: String(err) };
  }
}

function toTopicTitle(eventType) {
  const title = `IG | ${eventType}`;
  return title.length > 120 ? title.slice(0, 120) : title;
}

async function getOrCreateTopicThreadId(topicKey, topicTitle) {
  if (!ENABLE_FORUM_TOPICS || !forumAvailable || !topicKey) return null;

  if (topicThreadCache.has(topicKey)) {
    const cached = topicThreadCache.get(topicKey);
    return cached || null;
  }

  const created = await telegramApiCall('createForumTopic', {
    chat_id: CHAT_ID,
    name: toTopicTitle(topicTitle || topicKey),
  });

  if (created.ok && created.result?.message_thread_id) {
    const threadId = created.result.message_thread_id;
    topicThreadCache.set(topicKey, threadId);
    writeTopicCache();
    return threadId;
  }

  const description = String(created.description || '');
  const descriptionLower = description.toLowerCase();
  if (
    descriptionLower.includes('not a forum') ||
    descriptionLower.includes('chat is not a forum') ||
    descriptionLower.includes('not enough rights') ||
    descriptionLower.includes('topic_deleted')
  ) {
    forumAvailable = false;
    if (!forumFallbackLogged) {
      forumFallbackLogged = true;
      console.warn(
        "Telegram topiclar mavjud emas yoki huquq yetarli emas. Oddiy chat rejimiga o'tildi.",
      );
    }
    topicThreadCache.set(topicKey, 0);
    return null;
  }

  console.error(
    `Topic yaratishda xatolik (${topicKey}):`,
    created.description || 'unknown error',
  );

  // Shu ish jarayonida qayta-qayta create urmaslik uchun.
  topicThreadCache.set(topicKey, 0);
  return null;
}

// Telegram guruhiga xabar yuborish uchun funksiya
async function sendToTelegramGroup(
  messageHtml,
  topicKey = '',
  topicTitle = '',
) {
  return sendToTelegramMethod(
    'sendMessage',
    {
      text: messageHtml,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    },
    topicKey,
    topicTitle,
  );
}

async function sendToTelegramMethod(
  method,
  payload,
  topicKey = '',
  topicTitle = '',
) {
  const requestPayload = {
    chat_id: CHAT_ID,
    ...payload,
  };

  const threadId = await getOrCreateTopicThreadId(topicKey, topicTitle);
  if (threadId) {
    requestPayload.message_thread_id = threadId;
  }

  const response = await telegramApiCall(method, requestPayload);
  if (!response.ok) {
    console.error(`Telegram ${method} xatosi:`, response.description);
  }
  return response;
}

function truncateText(text = '', max = 900) {
  const value = String(text);
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function getAttachmentUrl(attachment) {
  return (
    attachment?.payload?.url ||
    attachment?.payload?.link ||
    attachment?.payload?.src ||
    attachment?.payload?.attachment_url ||
    ''
  );
}

async function downloadBuffer(url) {
  const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || '';
  const headers = ACCESS_TOKEN
    ? { Authorization: `Bearer ${ACCESS_TOKEN}` }
    : {};
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType =
    response.headers.get('content-type') || 'application/octet-stream';
  return { buffer, contentType };
}

async function sendFileToTelegram(
  method,
  fieldName,
  buffer,
  filename,
  contentType,
  extraPayload,
  topicKey,
  topicTitle,
) {
  const threadId = await getOrCreateTopicThreadId(topicKey, topicTitle);
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;

  const form = new FormData();
  form.append('chat_id', CHAT_ID);
  if (threadId) form.append('message_thread_id', String(threadId));
  if (extraPayload.caption) form.append('caption', extraPayload.caption);
  if (extraPayload.parse_mode)
    form.append('parse_mode', extraPayload.parse_mode);
  if (extraPayload.supports_streaming)
    form.append('supports_streaming', 'true');

  const blob = new Blob([buffer], { type: contentType });
  form.append(fieldName, blob, filename);

  try {
    const response = await fetch(url, { method: 'POST', body: form });
    const raw = await response.text();
    const body = JSON.parse(raw);
    if (!body?.ok) return { ok: false, description: body?.description || raw };
    return { ok: true, result: body.result };
  } catch (err) {
    return { ok: false, description: String(err) };
  }
}

async function sendDmAttachmentToTelegram(attachment, context) {
  const type = String(attachment?.type || 'file').toLowerCase();
  const url =
    attachment?.payload?.url ||
    attachment?.payload?.link ||
    attachment?.payload?.src ||
    attachment?.payload?.attachment_url ||
    '';

  const caption = `<b>Instagram DM</b>\nKimdan: ${context.userLink}\nTuri: <code>${escapeHtml(type)}</code>`;

  // Share (post/reel/story ulashish)
  if (type === 'share') {
    const shareUrl =
      attachment?.payload?.url ||
      attachment?.payload?.link ||
      attachment?.payload?.permalink_url ||
      '';
    const title = attachment?.payload?.title || '';
    const shareMsg =
      `${caption}${title ? `\nSarlavha: ${escapeHtml(title)}` : ''}` +
      (shareUrl ? `\n\n${escapeHtml(shareUrl)}` : '\n\nURL topilmadi');
    await sendToTelegramGroup(shareMsg, context.topicKey, context.topicTitle);
    return;
  }

  if (!url) {
    const fallback = `${caption}\n\n<b>URL topilmadi</b>\n<pre>${escapeHtml(shortJson(attachment))}</pre>`;
    await sendToTelegramGroup(fallback, context.topicKey, context.topicTitle);
    return;
  }

  try {
    const { buffer, contentType } = await downloadBuffer(url);
    const ext = contentType.split('/')[1]?.split(';')[0] || 'bin';
    const filename = `file.${ext}`;
    const shortCaption = truncateText(caption, 950);

    let method, fieldName;
    if (type === 'image' || type === 'sticker') {
      method = 'sendPhoto';
      fieldName = 'photo';
    } else if (type === 'video' || type === 'reel') {
      method = 'sendVideo';
      fieldName = 'video';
    } else if (type === 'audio' || type === 'voice_clip') {
      method = 'sendVoice';
      fieldName = 'voice';
    } else {
      method = 'sendDocument';
      fieldName = 'document';
    }

    const extraPayload = {
      caption: shortCaption,
      parse_mode: 'HTML',
      supports_streaming: true,
    };
    let result = await sendFileToTelegram(
      method,
      fieldName,
      buffer,
      filename,
      contentType,
      extraPayload,
      context.topicKey,
      context.topicTitle,
    );

    // Fallback: rasm bo'lsa document sifatida yubor
    if (!result.ok && method !== 'sendDocument') {
      result = await sendFileToTelegram(
        'sendDocument',
        'document',
        buffer,
        filename,
        contentType,
        extraPayload,
        context.topicKey,
        context.topicTitle,
      );
    }

    if (!result.ok) throw new Error(result.description);
  } catch (err) {
    console.error('Attachment yuborishda xatolik:', err);
    const fallback = `${caption}\n\nYuborib bo'lmadi.\nURL: ${escapeHtml(url)}`;
    await sendToTelegramGroup(fallback, context.topicKey, context.topicTitle);
  }
}

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getInstagramUserInfo(userId) {
  const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || '';
  const url = `https://graph.instagram.com/v21.0/${userId}?fields=name,username&access_token=${ACCESS_TOKEN}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (err) {
    console.error('User info olishda xatolik:', err);
    return null;
  }
}

async function getInstagramMediaInfo(mediaId) {
  const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || '';
  if (!ACCESS_TOKEN) {
    console.warn('INSTAGRAM_ACCESS_TOKEN kiritilmagan (media info)!');
    return null;
  }

  const fields =
    'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,username';
  const urls = [
    `https://graph.facebook.com/v21.0/${mediaId}?fields=${fields}&access_token=${ACCESS_TOKEN}`,
    `https://graph.instagram.com/v21.0/${mediaId}?fields=${fields}&access_token=${ACCESS_TOKEN}`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      return await response.json();
    } catch (err) {
      console.error('Media info olishda xatolik:', err);
    }
  }

  return null;
}

// Auto javob berish funksiyasi
async function autoReplyToInstagramDM(senderId, replyText) {
  const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || '';
  console.log({ ACCESS_TOKEN });
  if (!ACCESS_TOKEN) {
    console.warn('INSTAGRAM_ACCESS_TOKEN kiritilmagan!');
    return;
  }

  const url = `https://graph.instagram.com/v21.0/me/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: senderId },
        message: { text: replyText },
      }),
    });

    if (!response.ok) {
      console.error(
        'Instagram DM ga javob yuborishda xatolik:',
        await response.text(),
      );
    }
  } catch (err) {
    console.error('Instagram DM bilan aloqa xatosi:', err);
  }
}

function cleanupProcessedMessages() {
  const now = Date.now();
  for (const [key, ts] of processedMessages.entries()) {
    if (now - ts > PROCESSED_TTL_MS) {
      processedMessages.delete(key);
    }
  }

  if (processedMessages.size > PROCESSED_MAX_SIZE) {
    const keys = processedMessages.keys();
    while (processedMessages.size > Math.floor(PROCESSED_MAX_SIZE * 0.8)) {
      const oldestKey = keys.next().value;
      if (!oldestKey) break;
      processedMessages.delete(oldestKey);
    }
  }
}

function isDuplicateKey(key) {
  if (processedMessages.has(key)) return true;
  processedMessages.set(key, Date.now());
  return false;
}

function shortJson(value, max = 2500) {
  const text = JSON.stringify(value, null, 2);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function hashObject(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
    .slice(0, 24);
}

function getMessagingEventType(msg) {
  if (msg?.message?.is_echo) return 'dm.message_echo';
  if (msg?.message) return 'dm.message';
  if (msg?.read) return 'dm.read';
  if (msg?.reaction) return 'dm.reaction';
  if (msg?.delivery) return 'dm.delivery';
  if (msg?.postback) return 'dm.postback';
  if (msg?.optin) return 'dm.optin';
  if (msg?.referral) return 'dm.referral';
  return 'dm.other';
}

function getMessagingEventKey(msg) {
  const type = getMessagingEventType(msg);

  if (msg?.message?.mid) return `dm:mid:${msg.message.mid}`;
  if (msg?.reaction?.mid)
    return `dm:reaction:${msg.reaction.mid}:${msg.reaction.action || ''}`;
  if (msg?.read?.watermark)
    return `dm:read:${msg.sender?.id || ''}:${msg.read.watermark}`;
  if (msg?.delivery?.watermark)
    return `dm:delivery:${msg.sender?.id || ''}:${msg.delivery.watermark}`;

  return `dm:${type}:${hashObject(msg)}`;
}

function getChangeEventType(change) {
  const field = change?.field || 'unknown';
  return `change.${field}`;
}

function getChangeEventKey(change) {
  const field = change?.field || 'unknown';
  const value = change?.value || {};
  const stableId =
    value?.media_id ||
    value?.comment_id ||
    value?.id ||
    value?.target_id ||
    value?.event_id;

  if (stableId) return `change:${field}:${stableId}`;
  return `change:${field}:${hashObject(change)}`;
}

function verifyMetaSignature(req) {
  const signature = req.header('X-Hub-Signature-256');

  if (req.method === 'GET') return true;

  if (!META_APP_SECRET) {
    console.warn('META_APP_SECRET is empty — signature check skipped!');
    return true;
  }

  if (!signature) return false;

  const raw = req.rawBody || Buffer.from('');
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', META_APP_SECRET).update(raw).digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

app.get('/instagram/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('VERIFY OK ✅');
    return res.status(200).send(challenge || '');
  }

  console.error('VERIFY FAILED ❌');
  return res.status(400).send('Invalid verify token');
});

async function processInstagramWebhook(event) {
  console.log('========== IG EVENT ==========');
  console.log(JSON.stringify(event, null, 2));

  if (!event.entry || !Array.isArray(event.entry)) {
    const payloadMsg = `<b>Instagram Event</b>\nTuri: <code>entry.unknown</code>\n\n<pre>${escapeHtml(shortJson(event))}</pre>`;
    await sendToTelegramGroup(payloadMsg, 'entry.unknown', 'entry.unknown');
    return;
  }

  for (const entry of event.entry) {
    const hasChanges = Array.isArray(entry.changes) && entry.changes.length > 0;
    const hasMessaging =
      Array.isArray(entry.messaging) && entry.messaging.length > 0;

    if (!hasChanges && !hasMessaging) {
      const entryKey = `entry:unknown:${hashObject(entry)}`;
      if (!isDuplicateKey(entryKey)) {
        cleanupProcessedMessages();
        const entryMsg = `<b>Instagram Entry Event</b>\nTuri: <code>entry.unknown</code>\n\n<pre>${escapeHtml(shortJson(entry))}</pre>`;
        await sendToTelegramGroup(entryMsg, 'entry.unknown', 'entry.unknown');
      }
      continue;
    }

    // 1. changes eventlari
    if (entry.changes && Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        const changeType = getChangeEventType(change);
        const changeKey = getChangeEventKey(change);
        if (isDuplicateKey(changeKey)) continue;
        cleanupProcessedMessages();

        const value = change.value;

        // 1.a Yangi postlar va storylar (media)
        if (change?.field === "media" && value?.media_id) {
          const mediaId = String(value.media_id);
          const mediaInfo = await getInstagramMediaInfo(mediaId);
          const mediaType = String(mediaInfo?.media_type || "").toUpperCase();
          const username = mediaInfo?.username || "";
          const caption = mediaInfo?.caption || "";
          const permalink = mediaInfo?.permalink || "";
          const mediaUrl = mediaInfo?.media_url || mediaInfo?.thumbnail_url || "";

          const isStory = mediaType === "STORY";
          const topicKey = isStory ? "story" : "posts";
          const topicTitle = isStory ? "📖 Stories" : "📸 Posts";
          const title = isStory ? "Yangi Story (Instagram)" : "Yangi Post (Instagram)";

          const userLink = username
            ? `<a href="https://instagram.com/${encodeURIComponent(username)}">${escapeHtml(username)}</a>`
            : "Instagram sahifa";

          let tgMsg = `<b>${title}</b>\nKimdan: ${userLink}`;
          if (caption) tgMsg += `\n\n${escapeHtml(caption)}`;
          if (permalink) tgMsg += `\n\n${permalink}`;

          await sendToTelegramGroup(tgMsg, topicKey, topicTitle);

          // Rasmni ham yuborish
          if (mediaUrl) {
            try {
              const { buffer, contentType } = await downloadBuffer(mediaUrl);
              const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
              const isVideo = mediaType === "VIDEO" || mediaType === "REELS";
              const method = isVideo ? "sendVideo" : "sendPhoto";
              const fieldName = isVideo ? "video" : "photo";
              await sendFileToTelegram(
                method, fieldName, buffer,
                `media.${ext}`, contentType,
                { parse_mode: "HTML", supports_streaming: true },
                topicKey, topicTitle
              );
            } catch (err) {
              console.error("Media rasm yuborishda xatolik:", err);
            }
          }
          continue;
        }

        // 1.b Commentlar va mentionlar
        if (value && value.from) {
          const username = value.from.username;
          const text = value.text || 'Media/Boshqa narsa';

          // Username orqali Instagram profiliga havola (link)
          const userLink = username
            ? `<a href="https://instagram.com/${encodeURIComponent(username)}">${escapeHtml(username)}</a>`
            : `<a href="https://instagram.com/">Foydalanuvchi ID: ${escapeHtml(value.from.id || '')}</a>`;

          const tgMsg = `<b>Yangi bildirishnoma (Instagram)</b>\nKimdan: ${userLink}\n\nXabar: ${escapeHtml(text)}`;
          await sendToTelegramGroup(tgMsg, changeType, changeType);
          continue;
        }

        const genericChangeMsg = `<b>Instagram Event</b>\nTuri: <code>${escapeHtml(changeType)}</code>\n\n<pre>${escapeHtml(shortJson(change))}</pre>`;
        await sendToTelegramGroup(genericChangeMsg, changeType, changeType);
      }
    }

    // 2. messaging eventlari
    // 2. messaging eventlari
    if (entry.messaging && Array.isArray(entry.messaging)) {
      for (const msg of entry.messaging) {
        const eventType = getMessagingEventType(msg);

        // Keraksiz eventlarni o'tkazib yuborish
        if (
          ['dm.read', 'dm.delivery', 'dm.message_echo', 'dm.other'].includes(
            eventType,
          )
        )
          continue;

        const eventKey = getMessagingEventKey(msg);
        if (isDuplicateKey(eventKey)) continue;
        cleanupProcessedMessages();

        const senderId = msg?.sender?.id;
        if (!senderId || senderId === MY_IG_ID) continue;

        if (eventType === 'dm.message') {
          const hasText =
            typeof msg.message?.text === 'string' &&
            msg.message.text.trim().length > 0;
          const attachments = Array.isArray(msg.message?.attachments)
            ? msg.message.attachments
            : [];
          const hasAttachments = attachments.length > 0;

          // Na matn na fayl bo'lsa — o'tkazib yuborish
          if (!hasText && !hasAttachments) continue;

          const text = hasText ? msg.message.text : '';

          const userInfo = await getInstagramUserInfo(senderId);
          console.log({ userInfo });
          const name = userInfo?.name || "Noma'lum";
          const username = userInfo?.username || '';

          const userLink = username
            ? `<a href="https://instagram.com/${encodeURIComponent(username)}">${escapeHtml(name)} (@${escapeHtml(username)})</a>`
            : `<a href="https://instagram.com/">ID: ${escapeHtml(senderId)}</a>`;

          if (hasText) {
            const tgMsg = `<b>Yangi xabar (Instagram DM)</b>\nKimdan: ${userLink}\n\nXabar: ${escapeHtml(text)}`;
            await sendToTelegramGroup(tgMsg, eventType, eventType);
          }

          if (hasAttachments) {
            for (const attachment of attachments) {
              await sendDmAttachmentToTelegram(attachment, {
                userLink,
                topicKey: eventType,
                topicTitle: eventType,
              });
            }
          }

          const autoReplyText = `Assalomu alaykum!
Hozircha direktda javob bera olmaymiz.
Iltimos, biz bilan telefon orqali bog'laning:
📞 +998998098612
📞 +998946110066
Sizga e'tibor va sifat bilan xizmat ko'rsatamiz.`;
          await autoReplyToInstagramDM(senderId, autoReplyText);
          continue;
        }

        // dm.reaction — faqat reaction bo'lsa
        if (eventType === 'dm.reaction') {
          const emoji = msg?.reaction?.reaction || '';
          const userInfo = await getInstagramUserInfo(senderId);
          const username = userInfo?.username || senderId;
          const tgMsg = `<b>Instagram DM Reaction</b>\nKimdan: <code>${escapeHtml(username)}</code>\nReaksiya: ${escapeHtml(emoji)}`;
          await sendToTelegramGroup(tgMsg, eventType, eventType);
          continue;
        }
      }
    }
  }
}

app.post('/instagram/webhook', (req, res) => {
  if (!verifyMetaSignature(req)) {
    console.error('❌ Invalid signature.');
    return res.status(401).send('Invalid signature');
  }

  // Meta qayta yubormasligi uchun javobni darhol qaytaramiz
  res.status(200).send('EVENT_RECEIVED');

  const event = req.body;
  void processInstagramWebhook(event).catch((err) => {
    console.error('Error processing webhook:', err.message || err);
  });
});

app.listen(PORT, () => {
  console.log(`✅ Express listening on :${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/instagram/webhook`);
});

