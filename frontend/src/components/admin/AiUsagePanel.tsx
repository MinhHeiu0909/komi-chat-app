import { useEffect, useState, type ReactNode } from "react";
import axios from "axios";
import { ChartColumn, Loader2 } from "lucide-react";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { adminService } from "@/services/adminService";
import type { AiCallKind, AiUsageReport, AiUsageRow } from "@/types/aiUsage";
import { cn } from "@/lib/utils";

const RANGES = [
  { days: 1, label: "Hôm nay" },
  { days: 7, label: "7 ngày" },
  { days: 30, label: "30 ngày" },
];

const KIND_LABELS: Record<AiCallKind, string> = {
  chat: "Trả lời chat",
  summary: "Tóm tắt tin chưa đọc",
  embedding_search: "Tra cứu (embedding câu hỏi)",
  embedding_index: "Index tài liệu (chạy nền)",
  other: "Khác",
};

const num = new Intl.NumberFormat("vi-VN");
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const formatCost = (row: AiUsageRow) => (row.costUsd === null ? "—" : usd.format(row.costUsd));
const formatDuration = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} giây` : `${ms} ms`);
// ≈: có lời gọi mà nhà cung cấp không báo số token, đây là số ước tính
const approx = (row: AiUsageRow) => (row.estimatedCalls > 0 ? "≈ " : "");

const Stat = ({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) => (
  <div className="rounded-lg border bg-card p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
  </div>
);

// Bảng chung cho các mục "theo ngày / loại / người dùng"
const UsageTable = ({
  title,
  firstColumn,
  rows,
}: {
  title: string;
  firstColumn: string;
  rows: { key: string; label: ReactNode; row: AiUsageRow }[];
}) => (
  <section className="space-y-2">
    <h3 className="text-sm font-semibold">{title}</h3>
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{firstColumn}</th>
            <th className="px-3 py-2 text-right font-medium">Lượt gọi</th>
            <th className="px-3 py-2 text-right font-medium">Token vào</th>
            <th className="px-3 py-2 text-right font-medium">Token ra</th>
            <th className="px-3 py-2 text-right font-medium">Lỗi</th>
            <th className="px-3 py-2 text-right font-medium">TB / lượt</th>
            <th className="px-3 py-2 text-right font-medium">Chi phí</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                Chưa có lời gọi nào.
              </td>
            </tr>
          )}
          {rows.map(({ key, label, row }) => (
            <tr key={key} className={cn("border-t", row.calls === 0 && "text-muted-foreground")}>
              <td className="px-3 py-2 whitespace-nowrap">{label}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num.format(row.calls)}</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                {approx(row)}
                {num.format(row.inputTokens)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{num.format(row.outputTokens)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {row.errors > 0 ? (
                  <span className="text-destructive">
                    {num.format(row.errors)}
                    {row.rateLimited > 0 && ` (429: ${num.format(row.rateLimited)})`}
                  </span>
                ) : (
                  0
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                {row.calls ? formatDuration(row.avgDurationMs) : "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCost(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

/** Trang chi phí AI: tổng hợp AiCallLog (chỉ số liệu, không có nội dung câu hỏi). */
const AiUsagePanel = () => {
  const [days, setDays] = useState(7);
  const [report, setReport] = useState<AiUsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    adminService
      .aiUsage(days)
      .then((data) => active && setReport(data))
      .catch((err) => {
        if (!active) return;
        setReport(null);
        // không có quyền: backend trả 404 như trang không tồn tại
        setError(
          axios.isAxiosError(err) && err.response?.status === 404
            ? "Không tìm thấy trang này."
            : "Không tải được số liệu, thử lại sau nhé."
        );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [days]);

  const changeRange = (value: number) => {
    if (value === days) return;
    setLoading(true);
    setError(null);
    setDays(value);
  };

  const totals = report?.totals;

  return (
    <SidebarInset className="flex flex-col h-full flex-1 overflow-hidden rounded-sm shadow-md">
      <header className="sticky top-0 z-10 px-4 py-2 flex flex-wrap items-center gap-2 bg-background">
        <SidebarTrigger className="-ml-1 text-foreground" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <ChartColumn className="size-4 text-primary" />
        <h2 className="font-semibold">Chi phí AI</h2>

        <div role="group" aria-label="Khoảng thời gian" className="ml-auto flex rounded-md border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              aria-pressed={days === r.days}
              onClick={() => changeRange(r.days)}
              className={cn(
                "rounded px-3 py-1 text-sm transition-colors",
                days === r.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-background p-4 space-y-6">
        <p className="text-sm text-muted-foreground">
          Mỗi lần Komi AI gọi model (trả lời, tóm tắt, embedding) được ghi lại: chỉ có số token, thời gian và kết quả,
          không có nội dung câu hỏi. Số có dấu ≈ là ước tính (nhà cung cấp không báo số token). Log tự xoá sau 90 ngày.
        </p>

        {loading && !report ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : error ? (
          <p className="py-12 text-center text-muted-foreground">{error}</p>
        ) : report && totals ? (
          <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label="Lượt gọi"
                value={num.format(totals.calls)}
                hint={totals.aborted > 0 ? `${num.format(totals.aborted)} lượt bị dừng giữa chừng` : undefined}
              />
              <Stat
                label="Token vào / ra"
                value={`${approx(totals)}${num.format(totals.inputTokens)} / ${num.format(totals.outputTokens)}`}
                hint={`Embedding: ${num.format(totals.embeddingTokens)} token`}
              />
              <Stat
                label="Lỗi"
                value={<span className={cn(totals.errors > 0 && "text-destructive")}>{num.format(totals.errors)}</span>}
                hint={`Hết hạn mức (429): ${num.format(totals.rateLimited)}`}
              />
              <Stat
                label="Chi phí ước tính"
                value={formatCost(totals)}
                hint={
                  report.pricing.configured
                    ? "Nếu trả phí theo giá đã đặt (free tier: 0đ)"
                    : "Chưa đặt giá (AI_PRICE_* trong .env)"
                }
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Thời gian trung bình mỗi lượt: {totals.calls ? formatDuration(totals.avgDurationMs) : "—"}
            </p>

            <UsageTable
              title="Theo tính năng"
              firstColumn="Loại"
              rows={report.byKind.map((k) => ({ key: k.kind, label: KIND_LABELS[k.kind] ?? k.kind, row: k }))}
            />

            <UsageTable
              title="Theo người dùng"
              firstColumn="Người dùng"
              rows={report.byUser.map((u) => ({
                key: u.userId ?? "system",
                label: u.userId ? (
                  <span>
                    {u.displayName ?? "Người dùng đã xoá"}
                    {u.username && <span className="text-muted-foreground"> @{u.username}</span>}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Hệ thống (index chạy nền)</span>
                ),
                row: u,
              }))}
            />

            <UsageTable
              title="Theo ngày (giờ Việt Nam)"
              firstColumn="Ngày"
              rows={report.byDay.map((d) => ({
                key: d.day,
                label: d.day.split("-").reverse().join("/"),
                row: d,
              }))}
            />
          </div>
        ) : null}
      </div>
    </SidebarInset>
  );
};

export default AiUsagePanel;
