import { Heart } from "lucide-react";
import { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { User } from "@/types/user";
import { useUserStore } from "@/stores/useUserStore";
import { toast } from "sonner";

// Khớp giới hạn ở backend (userController.updateMe)
const MAX_DISPLAY_NAME = 50;
const MAX_BIO = 300;

type Props = {
  userInfo: User | null;
};

const PersonalInfoForm = ({ userInfo }: Props) => {
  const updateProfile = useUserStore((s) => s.updateProfile);
  const [form, setForm] = useState({
    displayName: userInfo?.displayName ?? "",
    bio: userInfo?.bio ?? "",
    phone: userInfo?.phone ?? "",
  });
  const [saving, setSaving] = useState(false);

  if (!userInfo) return null;

  // chỉ gửi những trường đã đổi
  const changes = Object.fromEntries(
    (Object.keys(form) as (keyof typeof form)[])
      .filter((key) => form[key].trim() !== (userInfo[key] ?? "").trim())
      .map((key) => [key, form[key].trim()])
  );
  const dirty = Object.keys(changes).length > 0;
  const nameMissing = !form.displayName.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || nameMissing || saving) return;

    setSaving(true);
    const ok = await updateProfile(changes);
    setSaving(false);
    if (ok) toast.success("Đã lưu thông tin cá nhân");
  };

  const field = (key: keyof typeof form) => ({
    id: key,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <Card className="glass-strong border-border/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="size-5 text-primary" />
          Thông tin cá nhân
        </CardTitle>
        <CardDescription>
          Cập nhật chi tiết cá nhân và thông tin hồ sơ của bạn
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Tên hiển thị</Label>
              <Input
                {...field("displayName")}
                maxLength={MAX_DISPLAY_NAME}
                aria-invalid={nameMissing || undefined}
                className="glass-light border-border/30"
              />
              {nameMissing && (
                <p className="text-xs text-destructive">Tên hiển thị không được để trống</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Số điện thoại</Label>
              <Input
                {...field("phone")}
                type="tel"
                inputMode="tel"
                placeholder="Ví dụ: 0912 345 678"
                className="glass-light border-border/30"
              />
            </div>

            {/* đổi username / email cần xác thực nên chưa cho sửa */}
            <div className="space-y-2">
              <Label htmlFor="username">Tên người dùng</Label>
              <Input
                id="username"
                value={userInfo.username}
                readOnly
                disabled
                className="glass-light border-border/30"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={userInfo.email}
                readOnly
                disabled
                className="glass-light border-border/30"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Tên người dùng và email hiện chưa đổi được.
          </p>

          <div className="space-y-2">
            <Label htmlFor="bio">Giới thiệu</Label>
            <Textarea
              {...field("bio")}
              rows={3}
              maxLength={MAX_BIO}
              placeholder="Vài dòng về bạn"
              className="glass-light border-border/30 resize-none"
            />
            <p className="text-right text-xs text-muted-foreground tabular-nums">
              {form.bio.length}/{MAX_BIO}
            </p>
          </div>

          <Button
            type="submit"
            disabled={!dirty || nameMissing || saving}
            className="w-full md:w-auto bg-gradient-primary hover:opacity-90 transition-opacity"
          >
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default PersonalInfoForm;
