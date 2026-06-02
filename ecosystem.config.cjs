/** PM2 — porta deve coincidir com nginx (packinghouse.noponto.io → 5731). */
module.exports = {
  apps: [
    {
      name: "packing-house-frontend",
      cwd: "/srv/apps/packing-house",
      script: "dist/server/index.mjs",
      interpreter: "/root/.nvm/versions/node/v22.12.0/bin/node",
      env: {
        NODE_ENV: "production",
        PORT: "5731",
        HOST: "0.0.0.0",
      },
    },
  ],
};
