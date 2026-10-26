module.exports = {
  apps: [
    {
      name: 'zeropulse',
      script: './bin/zeropulse',
      args: '--listen-addr 0.0.0.0:8080',
      autorestart: true,
      watch: false,
      max_memory_restart: '100M',
      env: {
        ZEROPULSE_LISTEN_ADDR: '0.0.0.0:8080',
        ZEROPULSE_DRY_RUN: 'false',
        ZEROPULSE_CPU_THRESHOLD: '80.0',
        ZEROPULSE_MEM_THRESHOLD: '85.0',
        ZEROPULSE_COOLDOWN: '60s',
      },
    },
  ],
};
