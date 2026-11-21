import type { Dispatch, SetStateAction } from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { ShieldCheck, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import ProfileCard from "./ProfileCard";
import { useAuthStore } from "@/stores/useAuthStore";
import PersonalInfoForm from "./PersonalInfoForm";
import OnlineStatusSettings from "./OnlineStatusSettings";
import PrivacySettings from "./PrivacySettings";

interface ProfileDialogProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

const tabClass =
  "flex h-12 flex-1 items-center justify-center gap-2 text-base font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground data-active:text-foreground";

const ProfileDialog = ({ open, setOpen }: ProfileDialogProps) => {
  const { user } = useAuthStore();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto p-0 text-sm sm:max-w-2xl beautiful-scrollbar">
        <DialogHeader className="px-6 pt-5 pb-4">
          <DialogTitle className="text-xl font-semibold">Cài đặt</DialogTitle>
        </DialogHeader>

        <ProfileCard user={user} />

        <TabsPrimitive.Root defaultValue="personal" className="mt-2">
          {/* thanh gạch chân trượt theo tab đang chọn (Base UI đặt --active-tab-*) */}
          <TabsPrimitive.List className="relative mx-6 flex border-b">
            <TabsPrimitive.Tab value="personal" className={tabClass}>
              <UserRound className="size-5" aria-hidden="true" />
              Tài khoản
            </TabsPrimitive.Tab>
            <TabsPrimitive.Tab value="privacy" className={tabClass}>
              <ShieldCheck className="size-5" aria-hidden="true" />
              Bảo mật
            </TabsPrimitive.Tab>
            <TabsPrimitive.Indicator className="absolute bottom-[-1px] left-(--active-tab-left) h-0.5 w-(--active-tab-width) rounded-full bg-primary transition-[left,width] duration-300 ease-out motion-reduce:transition-none" />
          </TabsPrimitive.List>

          <div className="overflow-hidden">
            <TabsPrimitive.Panel value="personal" className="settings-panel px-6 py-6 outline-none">
              <PersonalInfoForm userInfo={user} />
            </TabsPrimitive.Panel>

            <TabsPrimitive.Panel value="privacy" className="settings-panel space-y-8 px-6 py-6 outline-none">
              <OnlineStatusSettings />
              <PrivacySettings />
            </TabsPrimitive.Panel>
          </div>
        </TabsPrimitive.Root>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileDialog;
