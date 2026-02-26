export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    name: process.env.DATABASE_NAME,
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.CHAT_ID,
    enableTopics:
      (process.env.TELEGRAM_ENABLE_TOPICS ?? 'true').toLowerCase() !== 'false',
    topicCachePath:
      process.env.TELEGRAM_TOPIC_CACHE_PATH ?? '.telegram-topic-cache.json',
  },
  instagram: {
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
    verifyToken: process.env.INSTAGRAM_VERIFY_TOKEN,
    appSecret: process.env.META_APP_SECRET,
    igUserId: process.env.INSTAGRAM_IG_USER_ID ?? '17841420906468205',
    autoReplyText:
      process.env.INSTAGRAM_AUTO_REPLY_TEXT ??
      'Salom! Sizga tez orada javob beramiz.',
  },
});
