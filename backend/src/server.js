// Phải là import đầu tiên: ESM chạy các import trước code của file,
// nên nếu gọi dotenv.config() ở thân file thì socket/index.js và app.js
// đã đọc process.env (CLIENT_URL...) khi biến môi trường chưa được nạp.
import "dotenv/config";

import { v2 as cloudinary } from "cloudinary";
import { connectDB } from "./libs/db.js";
import "./app.js";
import { server } from "./socket/index.js";

const PORT = process.env.PORT || 5001;

const REQUIRED_ENV = ["MONGODB_CONNECTIONSTRING", "ACCESS_TOKEN_SECRET", "CLIENT_URL"];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Thiếu biến môi trường: ${missing.join(", ")} (xem backend/.env.example)`);
  process.exit(1);
}

// CLOUDINARY Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`server bắt đầu trên cổng ${PORT}`);
  });
});
