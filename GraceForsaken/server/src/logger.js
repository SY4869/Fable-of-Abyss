// ===================================================================
// ログ出力（pm2 がファイルへ保存し、pm2-logrotate で肥大化を防ぐ）
// ===================================================================
'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const current = LEVELS[process.env.LOG_LEVEL] || LEVELS.info;

function out(level, args) {
  if (LEVELS[level] < current) return;
  const line = [new Date().toISOString(), level.toUpperCase()].concat(args.map(a =>
    a instanceof Error ? (a.stack || a.message) : (typeof a === 'object' ? JSON.stringify(a) : String(a))));
  (level === 'error' || level === 'warn' ? console.error : console.log)(line.join(' '));
}

module.exports = {
  debug: (...a) => out('debug', a),
  info: (...a) => out('info', a),
  warn: (...a) => out('warn', a),
  error: (...a) => out('error', a),
};
