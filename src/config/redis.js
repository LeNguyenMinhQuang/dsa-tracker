const { Redis } = require("@upstash/redis");

function getRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn(
      "\n⚠️ [Upstash Redis Warning]: UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN environment variables are missing."
    );
    console.warn(
      "👉 Please create a .env file locally with your Upstash credentials. Refer to .env.example for guidance.\n"
    );
  }

  return Redis.fromEnv();
}

const redis = getRedisClient();

module.exports = redis;
