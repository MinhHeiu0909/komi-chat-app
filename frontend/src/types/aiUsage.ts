// GET /api/admin/ai-usage (backend/src/controllers/adminController.js)
export type AiCallKind = "chat" | "summary" | "embedding_index" | "embedding_search" | "other";

export interface AiUsageRow {
  calls: number;
  errors: number;
  rateLimited: number;
  aborted: number;
  estimatedCalls: number; // số lời gọi mà số token là ước tính
  inputTokens: number;
  chatInputTokens: number;
  embeddingTokens: number;
  outputTokens: number;
  avgDurationMs: number;
  costUsd: number | null; // null khi chưa đặt giá
}

export interface AiUsageReport {
  days: number;
  from: string;
  pricing: { input: number | null; output: number | null; embedding: number | null; configured: boolean };
  totals: AiUsageRow;
  byDay: (AiUsageRow & { day: string })[];
  byKind: (AiUsageRow & { kind: AiCallKind })[];
  byUser: (AiUsageRow & { userId: string | null; username: string | null; displayName: string | null })[];
}
