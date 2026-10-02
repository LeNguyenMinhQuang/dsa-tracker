// Chạy MỘT LẦN DUY NHẤT để đưa dữ liệu cũ trong data.json lên Upstash Redis.
//
// Cách chạy (từ thư mục gốc project, sau khi đã `npm install`):
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... node scripts/migrate-to-redis.js
//
// Hoặc tạo file .env ở gốc project với 2 dòng:
//   UPSTASH_REDIS_REST_URL=...
//   UPSTASH_REDIS_REST_TOKEN=...
// rồi chạy: node -r dotenv/config scripts/migrate-to-redis.js
// (cần `npm install dotenv --save-dev` nếu dùng cách này)

const fs = require("fs");
const path = require("path");
const { Redis } = require("@upstash/redis");

const DATA_KEY = "dsa-tracker-data";
const LOCAL_DATA_FILE = path.join(__dirname, "..", "data.json");

async function main() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error(
      "Thiếu UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN trong biến môi trường.",
    );
    process.exit(1);
  }

  if (!fs.existsSync(LOCAL_DATA_FILE)) {
    console.error(`Không tìm thấy file ${LOCAL_DATA_FILE}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(LOCAL_DATA_FILE, "utf-8");
  const data = JSON.parse(raw);

  const redis = Redis.fromEnv();

  const existing = await redis.get(DATA_KEY);
  if (existing) {
    console.log(
      "⚠️  Đã có dữ liệu trên Redis rồi. Script sẽ GHI ĐÈ dữ liệu đó bằng data.json local.",
    );
    console.log("   Nhấn Ctrl+C trong 5 giây nếu bạn KHÔNG muốn ghi đè...");
    await new Promise((r) => setTimeout(r, 5000));
  }

  await redis.set(DATA_KEY, data);

  console.log("✅ Đã tải lên Redis thành công:");
  console.log("   - problems:", Object.keys(data.problems || {}).length);
  console.log("   - days:", Object.keys(data.days || {}).length);
  console.log("   - words:", Object.keys(data.words || {}).length);
  console.log("   - groups:", Object.keys(data.groups || {}).length);
  console.log("   - checklists:", Object.keys(data.checklists || {}).length);
}

main().catch((err) => {
  console.error("Lỗi khi migrate:", err);
  process.exit(1);
});
