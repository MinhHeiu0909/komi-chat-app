import { Card } from "@/components/ui/card";
import { formatOnlineTime, cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router";
import { useSidebar } from "@/components/ui/sidebar";

interface ChatCardProps {
  convoId: string;
  name: string;
  timestamp?: Date;
  isActive: boolean;
  onSelect: (id: string) => void;
  unreadCount?: number;
  leftSection: React.ReactNode;
  subtitle: React.ReactNode;
  // nút phụ bên phải dòng phụ đề (vd. "Tóm tắt")
  action?: React.ReactNode;
  // nhãn nhỏ cạnh tên (vd. "AI" của Komi AI)
  badge?: React.ReactNode;
  className?: string;
}

const ChatCard = ({
  convoId,
  name,
  timestamp,
  isActive,
  onSelect,
  unreadCount,
  leftSection,
  subtitle,
  action,
  badge,
  className,
}: ChatCardProps) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();

  // đang ở trang khác (vd. Tài liệu chung) thì chọn cuộc trò chuyện xong quay về trang chat
  const handleClick = () => {
    onSelect(convoId);
    // điện thoại: thu thanh bên để thấy khung chat (kể cả khi bấm lại cuộc đang mở)
    setOpenMobile(false);
    if (pathname !== "/") navigate("/");
  };

  return (
    <Card
      key={convoId}
      className={cn(
        "border-none p-3 cursor-pointer transition-smooth glass hover:bg-muted/30",
        isActive &&
          "ring-2 ring-primary/50 bg-gradient-to from-primary-glow/10 to-primary-foreground",
        className
      )}
      onClick={handleClick}
    >
      <div className="flex items-center gap-3">
        <div className="relative">{leftSection}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <h3
                className={cn(
                  "font-semibold text-sm truncate",
                  unreadCount && unreadCount > 0 && "text-foreground"
                )}
              >
                {name}
              </h3>
              {badge}
            </div>

            <span className="text-xs text-muted-foreground">
              {timestamp ? formatOnlineTime(timestamp) : ""}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 flex-1 min-w-0">{subtitle}</div>
            {action}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default ChatCard;
