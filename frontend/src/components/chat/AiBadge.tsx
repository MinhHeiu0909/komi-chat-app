import { Sparkles } from "lucide-react";

// Nhãn "✦ AI" vàng nghệ đặt cạnh tên Komi (thanh bên, đầu khung chat, danh sách thành viên)
const AiBadge = () => (
  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[hsl(var(--ai)/0.15)] px-1.5 py-0.5 text-[11px] leading-none font-semibold text-[hsl(38_80%_32%)] dark:text-[hsl(var(--ai))]">
    <Sparkles className="size-3" aria-hidden="true" />
    AI
  </span>
);

export default AiBadge;
