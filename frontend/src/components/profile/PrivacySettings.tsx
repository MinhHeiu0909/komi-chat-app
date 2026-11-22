import { Shield } from "lucide-react";
import { useState } from "react";
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
    className: "h-11 px-3.5 text-sm md:text-sm",
  });

  return (
    <section className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Shield className="size-5 text-primary" aria-hidden="true" />
          Đổi mật khẩu
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Đổi xong, các thiết bị khác đang đăng nhập sẽ bị đăng xuất.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border p-4">
        <div className="space-y-2">
          <Label htmlFor="password-current" className="text-sm font-medium">Mật khẩu hiện tại</Label>
          <Input {...field("current")} autoComplete="current-password" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password-next" className="text-sm font-medium">Mật khẩu mới</Label>
            <Input
              {...field("next")}
              autoComplete="new-password"
              aria-invalid={tooShort || undefined}
            />
            {tooShort && (
              <p className="text-sm text-destructive">
                Cần ít nhất {MIN_PASSWORD_LENGTH} ký tự
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password-confirm" className="text-sm font-medium">Nhập lại mật khẩu mới</Label>
            <Input
              {...field("confirm")}
              autoComplete="new-password"
              aria-invalid={mismatch || undefined}
            />
            {mismatch && <p className="text-sm text-destructive">Mật khẩu nhập lại không khớp</p>}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={!canSubmit}
            className="h-10 w-full px-5 text-sm bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
          >
            {saving ? "Đang đổi…" : "Đổi mật khẩu"}
          </Button>
        </div>
      </form>
    </section>
  );
};

export default PrivacySettings;
