module.exports = {
  apps: [
    {
      name: 'futarchy-agent',
      script: './agent/dist/index.js',
      cwd: '/home/deploy/private-futarchy',

      // Restart policy
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 5000,
      max_restarts: 20,
      min_uptime: '30s',

      // Environment
      env: {
        NODE_ENV: 'production',
      },
      env_devnet: {
        NODE_ENV: 'production',
        RPC_URL: 'https://api.devnet.solana.com',
      },
      env_mainnet: {
        NODE_ENV: 'production',
        RPC_URL: 'https://api.mainnet-beta.solana.com',
      },

      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/pm2-error.log',
      out_file:   './logs/pm2-out.log',
      merge_logs: true,

      // Graceful shutdown
      kill_timeout: 10000,
      listen_timeout: 10000,
      shutdown_with_message: true,
    },
  ],
};

