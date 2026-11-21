// Linh vật Komi (logo bong bóng: hai chấm + ngôi sao AI) đi qua đi lại dưới chữ "Komi".
// Chỉ để trang trí: aria-hidden, không nhận chuột. Chuyển động nằm ở index.css (.komi-walk),
// tắt khi máy bật "giảm chuyển động".
const HeaderMascot = () => (
  <div className="pointer-events-none relative h-5" aria-hidden="true">
    <div className="komi-walk absolute top-0 left-0">
      <div className="komi-walk-flip">
        <svg className="komi-walk-bob block" width="24" height="22" viewBox="0 0 48 44">
          {/* thân trắng để nổi trên nền cổ vịt của header */}
          <path
            d="M8 2h32a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H20l-9 8v-8H8a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z"
            fill="#FFFFFF"
          />
          <circle className="komi-dot komi-dot-1" cx="13" cy="18" r="3.4" fill="#0E5A63" />
          <circle className="komi-dot komi-dot-2" cx="22" cy="18" r="3.4" fill="#0E5A63" />
          <path
            className="komi-star"
            d="M33 10.5c.6 4.6 1.6 5.6 6.2 6.2-4.6.6-5.6 1.6-6.2 6.2-.6-4.6-1.6-5.6-6.2-6.2 4.6-.6 5.6-1.6 6.2-6.2z"
            fill="#C98A1B"
          />
        </svg>
      </div>
    </div>
  </div>
);

export default HeaderMascot;
