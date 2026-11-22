import { useChatStore } from "@/stores/useChatStore";
import DirectMessageCard from "./DirectMessageCard";
// import DirectMessageCard from "./DirectMessageCard";

const DirectMessageList = () => {
  const { conversations } = useChatStore();

  if (!conversations) return;

  // chat với Komi AI có thẻ riêng (KomiAiCard) ở đầu thanh bên
  const directConversations = conversations.filter(
    (convo) => convo.type === "direct" && !convo.participants.some((p) => p.isBot)
  );

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      {directConversations.map((convo) => (
        <DirectMessageCard
          convo={convo}
          key={convo._id}
        />
      ))}
    </div>
  );
};

export default DirectMessageList;
