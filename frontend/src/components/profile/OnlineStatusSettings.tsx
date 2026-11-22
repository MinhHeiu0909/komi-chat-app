import { Eye } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuthStore } from "@/stores/useAuthStore";
import { useUserStore } from "@/stores/useUserStore";
import { useState } from "react";

// Trước là tab "Cấu hình" (kèm công tắc chế độ tối, nay chỉ còn ở thanh bên);
// công tắc online là cài đặt riêng tư nên chuyển sang tab "Bảo mật".
const OnlineStatusSettings = () => {
  // lưu vào tài khoản; tắt thì server không báo mình online cho người khác
  const showOnline = useAuthStore((s) => s.user?.showOnlineStatus !== false);
  const updateProfile = useUserStore((s) => s.updateProfile);
  const [saving, setSaving] = useState(false);

  const toggleOnline = async (checked: boolean) => {
    setSaving(true);
    await updateProfile({ showOnlineStatus: checked });
    setSaving(false);
  };

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <Eye className="size-5 text-primary" aria-hidden="true" />
        Trạng thái online
      </h3>
      <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
        <div>
          <Label htmlFor="online-status" className="text-sm font-medium">
            Hiển thị trạng thái online
          </Label>
          <p className="mt-1 text-sm text-muted-foreground">
            {showOnline
              ? "Người khác thấy khi bạn đang online."
              : "Đang ẩn: người khác luôn thấy bạn offline."}
          </p>
        </div>
        <Switch
          id="online-status"
          checked={showOnline}
          disabled={saving}
          onCheckedChange={toggleOnline}
          className="h-6! w-11! px-[2px] *:data-[slot=switch-thumb]:size-5!"
        />
      </div>
    </section>
  );
};

export default OnlineStatusSettings;
