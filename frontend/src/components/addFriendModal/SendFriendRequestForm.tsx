import type { UseFormRegister } from "react-hook-form";
import type { IFormValues } from "../chat/AddFriendModal";
import type { User } from "@/types/user";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { UserPlus } from "lucide-react";
import UserAvatar from "../chat/UserAvatar";

interface SendRequestProps {
  user?: User;
  register: UseFormRegister<IFormValues>;
  loading: boolean;
  searchedUsername: string;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}

const SendFriendRequestForm = ({
  user,
  register,
  loading,
  searchedUsername,
  onSubmit,
  onBack,
}: SendRequestProps) => {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* người vừa tìm thấy */}
      <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
        <UserAvatar
          type="sidebar"
          name={user?.displayName ?? searchedUsername}
          avatarUrl={user?.avatarUrl}
        />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{user?.displayName ?? searchedUsername}</p>
          <p className="truncate text-muted-foreground">@{user?.username ?? searchedUsername}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="message" className="text-sm font-medium">
          Lời giới thiệu <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
        </Label>
        <Textarea
          id="message"
          rows={4}
          placeholder="Chào bạn, kết bạn để tiện trao đổi công việc nhé."
          className="min-h-28 resize-none px-3.5 py-3 text-sm md:text-sm"
          {...register("message")}
        />
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="outline" className="h-10 flex-1" onClick={onBack}>
          Quay lại
        </Button>

        <Button
          type="submit"
          disabled={loading}
          className="h-10 flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {loading ? (
            <span>Đang gửi...</span>
          ) : (
            <>
              <UserPlus className="size-4 mr-2" /> Gửi lời mời
            </>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
};

export default SendFriendRequestForm;
