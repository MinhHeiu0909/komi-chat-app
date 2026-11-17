/**
 * Giá trị mặc định của biến môi trường, chạy NGAY SAU dotenv/config (xem server.js),
 * trước khi app.js và socket/index.js đọc process.env lúc nạp.
 */

// Render tự đặt RENDER_EXTERNAL_URL (https://<tên>.onrender.com). Bản deploy một service
// có frontend cùng địa chỉ, nên không cần biết trước địa chỉ để điền CLIENT_URL.
if (!process.env.CLIENT_URL && process.env.RENDER_EXTERNAL_URL) {
  process.env.CLIENT_URL = process.env.RENDER_EXTERNAL_URL;
}
