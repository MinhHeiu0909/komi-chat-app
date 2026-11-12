import { Square } from "lucide-react";
import { Card } from "../ui/card";
import UserAvatar from "./UserAvatar";
import MessageContent from "./MessageContent";
import { useSocketStore } from "@/stores/useSocketStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { AiStream, Conversation } from "@/types/chat";

const TypingDots = () => (
  <span className="flex gap-1 py-1" aria-label="Komi AI đang trả lời">
    {[0, 150, 300].map((delay) => (
      <span
        key={delay}
        className="size-1.5 rounded-full bg-muted-foreground motion-safe:animate-bounce"
        style={{ animationDelay: `${delay}ms` }}
      />
    ))}
  </span>
);

const AiStreamItem = ({ stream, convo }: { stream: AiStream; convo: Conversation }) => {
  const stopAiStream = useSocketStore((s) => s.stopAiStream);
  const isAsker = useAuthStore((s) => s.user?._id === stream.askerId);
  const bot = convo.participants.find((p) => p._id === stream.botId);

  return (
    <div className="flex gap-2 mt-1 justify-start" aria-live="polite">
      <div className="w-8">
        <UserAvatar type="chat" name={bot?.displayName ?? "Komi AI"} avatarUrl={bot?.avatarUrl ?? undefined} />
      </div>
      <div className="max-w-xs lg:max-w-md min-w-0 space-y-1 flex flex-col items-start">
        <Card data-bubble className="p-3 max-w-full min-w-0 chat-bubble-received">
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
        <AiStreamItem key={stream.streamId} stream={stream} convo={convo} />
      ))}
    </div>
  );
};

export default AiStreamBubbles;
