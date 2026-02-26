module.exports = {
  apps: [
    {
      name: "instagram-webhook",
      script: "main.js",
      watch: false,
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      env: {

          NODE_ENV: "production",
          PORT: 3100,
          INSTAGRAM_ACCESS_TOKEN:"IGAAZBKrVt8AVBBZAGF2ay1ZAVnhEV2xNUlZAzcWtBLXVVZAHFMVjU4dEM4UnA4bldtc2VYU2s1SlZAqR3BuZAEl3V2ZAZAcUFHSDJyLVFERTZAUNlcya3JqVmZAvOGlLSURja1doWGczYWlSZA1VlZAFBhMVNEQkgzdVFB",
          INSTAGRAM_ACCESS_TOKEN2:"IGAAZBKrVt8AVBBZAFlOX0tVeFJvMG9xYUQ4d0t6aDEzalVRSWladGtITXVnTDVYOGJlaHBlSUtvY0hFbjNMN0JVXzRjNzIyNjZAPRGhvTklleTJUbWhZAdm42c2F5UUg4YjFiVEx4cUJJT214UGdtTjIyUS1RUllWM1BKenBZAd0FYcjBXeWwzeEQtM0I2SzYxRFhBNm9sNAZDZD",
          INSTAGRAM_VERIFY_TOKEN: "xamidullo1421",
          META_APP_SECRET: "dcb941e74c6d4d189038347f9362db7c",
          TELEGRAM_BOT_TOKEN: "8294260714:AAFcuOJNrsVnmQzKwERwN8FpWAjm1U0L0QI",
          CHAT_ID: "-1003814144946",
          TELEGRAM_ENABLE_TOPICS: "true"
      }
    }
  ]
};


