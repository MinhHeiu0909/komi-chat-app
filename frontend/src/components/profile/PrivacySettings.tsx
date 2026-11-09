import { Shield } from "lucide-react";
import { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUserStore } from "@/stores/useUserStore";

// Khớp MIN_PASSWORD_LENGTH ở backend (authController)
const MIN_PASSWORD_LENGTH = 6;

const EMPTY = { current: "", next: "", confirm: "" };

// Trước đây có thêm "Cài đặt thông báo", "Chặn & Báo cáo", "Xoá tài khoản"
// nhưng chưa có logic nên đã bỏ; chỉ giữ đổi mật khẩu.
const PrivacySettings = () => {
  const changePassword = useUserStore((s) => s.changePassword);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const tooShort = form.next.length > 0 && form.next.length < MIN_PASSWORD_LENGTH;
  const mismatch = form.confirm.length > 0 && form.confirm !== form.next;
  const canSubmit =
    form.current && form.next.length >= MIN_PASSWORD_LENGTH && form.confirm === form.next && !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    const ok = await changePassword(form.current, form.next);
    setSaving(false);
    if (ok) setForm(EMPTY);
  };

  const field = (key: keyof typeof EMPTY) => ({
    id: `password-${key}`,
    type: "password",
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
    className: "glass-light border-border/30",
  });

  return (
    <Card className="glass-strong border-border/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Đổi mật khẩu
        </CardTitle>
        <CardDescription>
          Đổi xong, các thiết bị khác đang đăng nhập sẽ bị đăng xuất
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password-current">Mật khẩu hiện tại</Label>
            <Input {...field("current")} autoComplete="current-password" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password-next">Mật khẩu mới</Label>
            <Input
              {...field("next")}
              autoComplete="new-password"
              aria-invalid={tooShort || undefined}
            />
            {tooShort && (
              <p className="text-xs text-destructive">
                Mật khẩu mới cần ít nhất {MIN_PASSWORD_LENGTH} ký tự
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password-confirm">Nhập lại mật khẩu mới</Label>
            <Input
              {...field("confirm")}
              autoComplete="new-password"
              aria-invalid={mismatch || undefined}
            />
            {mismatch && <p className="text-xs text-destructive">Mật khẩu nhập lại không khớp</p>}
          </div>

          <Button
            type="submit"
            disabled={!canSubmit}
            className="w-full md:w-auto bg-gradient-primary hover:opacity-90 transition-opacity"
          >
            {saving ? "Đang đổi…" : "Đổi mật khẩu"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default PrivacySettings;
