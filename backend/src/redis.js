const Redis = require('ioredis');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: 1,
  retryStrategy(times) {
    return Math.min(times * 100, 3000);
  },
  lazyConnect: false
});

redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('error', (err) => console.error('[Redis] Error:', err.message));

module.exports = redis;
