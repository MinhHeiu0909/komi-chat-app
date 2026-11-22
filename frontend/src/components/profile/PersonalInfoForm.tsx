import { Lock } from "lucide-react";
import { useState } from "react";
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

  const inputClass = "h-11 px-3.5 text-sm md:text-sm";

  // nhãn bên trái, ô nhập bên phải (điện thoại thì nhãn nằm trên)
  const row = (label: React.ReactNode, control: React.ReactNode, htmlFor: string) => (
    <div className="grid gap-2 sm:grid-cols-[9rem_1fr] sm:items-center sm:gap-4">
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </Label>
      {control}
    </div>
  );

  const locked = (id: string, value: string, type = "text") => (
    <div className="relative">
      <Input id={id} type={type} value={value} readOnly disabled className={`${inputClass} pr-10`} />
      <Lock
        className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {row(
        "Tên hiển thị",
        <div className="space-y-1.5">
          <Input
            {...field("displayName")}
            maxLength={MAX_DISPLAY_NAME}
            aria-invalid={nameMissing || undefined}
            className={inputClass}
          />
          {nameMissing && (
            <p className="text-sm text-destructive">Tên hiển thị không được để trống</p>
          )}
        </div>,
        "displayName"
      )}

      {row(
        "Số điện thoại",
        <Input
          {...field("phone")}
          type="tel"
          inputMode="tel"
          placeholder="Ví dụ: 0912 345 678"
          className={inputClass}
        />,
        "phone"
      )}

      {/* đổi username / email cần xác thực nên chưa cho sửa */}
      {row("Tên người dùng", locked("username", userInfo.username), "username")}
      {row("Email", locked("email", userInfo.email, "email"), "email")}

      <div className="grid gap-2 sm:grid-cols-[9rem_1fr] sm:gap-4">
        <Label htmlFor="bio" className="self-start text-sm font-medium sm:pt-3">
          Giới thiệu
        </Label>
        <div className="space-y-1.5">
          <Textarea
            {...field("bio")}
            rows={4}
            maxLength={MAX_BIO}
            placeholder="Vài dòng về bạn: phòng ban, việc đang phụ trách…"
            className="min-h-28 resize-none px-3.5 py-3 text-sm md:text-sm"
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums">
            {form.bio.length}/{MAX_BIO}
          </p>
        </div>
      </div>

      <div className="flex flex-col-reverse items-stretch gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Tên người dùng và email hiện chưa đổi được.</p>
        <Button
          type="submit"
          disabled={!dirty || nameMissing || saving}
          className="h-10 px-5 text-sm bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {saving ? "Đang lưu…" : "Lưu thay đổi"}
        </Button>
      </div>
    </form>
  );
};

export default PersonalInfoForm;
