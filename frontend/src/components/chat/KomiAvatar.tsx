import { cn } from "@/lib/utils";

// Avatar riêng của Komi AI: linh vật (bong bóng trắng, hai chấm, ngôi sao nghệ) trên nền cổ vịt,
// để không lẫn với avatar chữ cái của người thật.
const SIZES = { sidebar: "size-12", chat: "size-8" } as const;

const KomiAvatar = ({ type, className }: { type: keyof typeof SIZES; className?: string }) => (
  <span
    role="img"
    aria-label="Komi"
    className={cn(
      "flex shrink-0 items-center justify-center rounded-full bg-[#0E5A63] ring-2 ring-[hsl(var(--ai))]",
      SIZES[type],
      className
    )}
  >
    <svg viewBox="0 0 48 44" className="w-[62%]" aria-hidden="true">
      <path d="M8 2h32a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H20l-9 8v-8H8a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z" fill="#FFFFFF" />
      <circle cx="13" cy="18" r="3.4" fill="#0E5A63" />
      <circle cx="22" cy="18" r="3.4" fill="#0E5A63" />
      <path
        d="M33 10.5c.6 4.6 1.6 5.6 6.2 6.2-4.6.6-5.6 1.6-6.2 6.2-.6-4.6-1.6-5.6-6.2-6.2 4.6-.6 5.6-1.6 6.2-6.2z"
        fill="#C98A1B"
      />
    </svg>
  </span>
);

export default KomiAvatar;
