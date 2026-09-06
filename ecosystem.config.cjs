module.exports = {
  apps: [
    {
      name: 'instagram-bridge',
      cwd: __dirname,
      script: 'dist/src/main.js',
      watch: false,
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3100,
        DATABASE_ENABLED: 'false',
      },
    },
  ],
};
