import { Square } from "lucide-react";
import { Card } from "../ui/card";
import KomiAvatar from "./KomiAvatar";
import MessageContent from "./MessageContent";
import { useSocketStore } from "@/stores/useSocketStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { AiStream, Conversation } from "@/types/chat";

const TypingDots = () => (
  <span className="flex gap-1 py-1" aria-label="Komi đang trả lời">
    {[0, 150, 300].map((delay) => (
      <span
        key={delay}
        className="size-1.5 rounded-full bg-muted-foreground motion-safe:animate-bounce"
        style={{ animationDelay: `${delay}ms` }}
      />
    ))}
  </span>
);

const AiStreamItem = ({ stream }: { stream: AiStream }) => {
  const stopAiStream = useSocketStore((s) => s.stopAiStream);
  const isAsker = useAuthStore((s) => s.user?._id === stream.askerId);

  return (
    <div className="flex gap-2 mt-3 justify-start" aria-live="polite">
      <div className="w-8 shrink-0">
        <KomiAvatar type="chat" />
      </div>
      <div className="max-w-[88%] md:max-w-xl min-w-0 space-y-1 flex flex-col items-start">
        <Card
          data-bubble
          className="chat-ai-note gap-0 px-3.5 py-2.5 text-sm/relaxed ring-0 rounded-md rounded-r-2xl max-w-full min-w-0"
        >
          {stream.content ? <MessageContent content={stream.content} /> : <TypingDots />}
        </Card>
        {isAsker && (
          <button
            type="button"
            onClick={() => stopAiStream(stream.streamId)}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary"
          >
            <Square className="size-3 fill-current" />
            Dừng
          </button>
        )}
      </div>
    </div>
  );
};

/** Các câu trả lời Komi AI đang streaming trong conversation đang mở. */
const AiStreamBubbles = ({ convo }: { convo: Conversation }) => {
  const aiStreams = useSocketStore((s) => s.aiStreams);
  const streams = Object.values(aiStreams).filter((s) => s.conversationId === convo._id);
  if (streams.length === 0) return null;

  return (
    <div className="flex flex-col">
      {streams.map((stream) => (
        <AiStreamItem key={stream.streamId} stream={stream} />
      ))}
    </div>
  );
};

export default AiStreamBubbles;
