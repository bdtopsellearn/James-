module.exports = {
  apps: [
    {
      name: 'pnweb-api',
      script: './api-server.cjs',
      cwd: __dirname,
      interpreter: 'node',                    // ← ✅ এই লাইন যোগ করো
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production', TZ: 'Asia/Dhaka' },
      error_file: './logs/pnweb-api.err.log',
      out_file: './logs/pnweb-api.out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'pnworker',
      script: './worker.cjs',
      cwd: __dirname,
      interpreter: 'node',                    // ← ✅ এই লাইন যোগ করো
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      kill_timeout: 15000,
      env: { NODE_ENV: 'production', TZ: 'Asia/Dhaka' },
      error_file: './logs/pnworker.err.log',
      out_file: './logs/pnworker.out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
