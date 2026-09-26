// pm2 設定。clusterモードにしないこと（ルームはプロセスのメモリ上にあるため1プロセス固定）。
//   pm2 start ecosystem.config.js && pm2 save
module.exports = {
  apps: [{
    name: 'gf-pvp',
    script: 'src/index.js',
    cwd: __dirname,
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    max_memory_restart: '700M',
    env: { NODE_ENV: 'production' },
    time: true,
  }],
};
