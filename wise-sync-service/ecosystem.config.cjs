const path = require("path");

/** @type {import('pm2').StartOptions} */
module.exports = {
  apps: [
    {
      name: "wise-sync-service",
      script: path.join(__dirname, "dist", "index.js"),
      cwd: __dirname,
      interpreter: "/root/.nvm/versions/node/v22.12.0/bin/node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        TZ: "America/Sao_Paulo",
        PORT: process.env.PORT || "3021",
      },
    },
  ],
};
