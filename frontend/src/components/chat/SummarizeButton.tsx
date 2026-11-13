import { useState } from "react";
import { Sparkles } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { chatService } from "@/services/chatService";
import { useChatStore } from "@/stores/useChatStore";

/**
 * "Tôi đã bỏ lỡ gì": Komi AI tóm tắt tin chưa đọc của cuộc chat này vào cuộc chat
 * riêng với bot, rồi mở cuộc chat đó để xem bản tóm tắt chạy dần.
 * Nằm ở danh sách chat vì mở cuộc chat ra là bị đánh dấu đã đọc ngay.
 */
const SummarizeButton = ({ convoId }: { convoId: string }) => {
  const [loading, setLoading] = useState(false);

  const summarize = async (e: React.MouseEvent) => {
    e.stopPropagation(); // không mở cuộc chat (sẽ bị đánh dấu đã đọc)
    if (loading) return;
    setLoading(true);
    try {
      const { conversationId } = await chatService.summarizeUnread(convoId);
      const store = useChatStore.getState();
      // cuộc chat với bot có thể vừa được tạo: tải lại danh sách nếu chưa có
      if (!store.conversations.some((c) => c._id === conversationId)) {
        await store.fetchConversations();
      }
      useChatStore.getState().setActiveConversation(conversationId);
      if (!useChatStore.getState().messages[conversationId]) {
        await useChatStore.getState().fetchMessages(conversationId);
      }
    } catch (error) {
      const message = axios.isAxiosError(error) ? error.response?.data?.message : undefined;
      toast.error(message ?? "Không tóm tắt được, bạn thử lại sau nhé");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={summarize}
      disabled={loading}
      title="Komi AI tóm tắt các tin chưa đọc"
      className="ml-2 flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-50"
    >
      <Sparkles className="size-3" />
      {loading ? "Đang gửi…" : "Tóm tắt"}
    </button>
  );
};

export default SummarizeButton;
