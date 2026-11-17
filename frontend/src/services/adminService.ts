import api from "@/lib/axios";
import type { AiUsageReport } from "@/types/aiUsage";

// Trang admin: /api/admin (người không có quyền nhận 404)
export const adminService = {
  async aiUsage(days: number): Promise<AiUsageReport> {
    const res = await api.get("/admin/ai-usage", { params: { days } });
    return res.data;
  },
};
