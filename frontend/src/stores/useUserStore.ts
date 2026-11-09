import { userService } from "@/services/userService";
import type { UserState } from "@/types/store";
import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";
import { toast } from "sonner";
import { useChatStore } from "./useChatStore";
import axios from "axios";

const serverMessage = (error: unknown, fallback: string) =>
  (axios.isAxiosError(error) && (error.response?.data?.message as string | undefined)) || fallback;

export const useUserStore = create<UserState>(() => ({
  updateAvatarUrl: async (formData) => {
    try {
      const { user, setUser } = useAuthStore.getState();
      const data = await userService.uploadAvatar(formData);

      if (user) {
        setUser({
          ...user,
          avatarUrl: data.avatarUrl,
        });

        useChatStore.getState().fetchConversations();
      }
    } catch (error) {
      console.error("Lỗi khi updateAvatarUrl", error);
      toast.error("Upload avatar không thành công!");
    }
  },

  updateProfile: async (patch) => {
    try {
      const user = await userService.updateMe(patch);
      useAuthStore.getState().setUser(user);
      // tên hiển thị nằm trong danh sách thành viên của các cuộc trò chuyện
      if (patch.displayName !== undefined) useChatStore.getState().fetchConversations();
      return true;
    } catch (error) {
      console.error("Lỗi khi cập nhật hồ sơ", error);
      toast.error(serverMessage(error, "Không lưu được thay đổi"));
      return false;
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    try {
      const { signedOutSessions } = await userService.changePassword(currentPassword, newPassword);
      toast.success(
        signedOutSessions > 0
          ? `Đã đổi mật khẩu và đăng xuất ${signedOutSessions} thiết bị khác`
          : "Đã đổi mật khẩu"
      );
      return true;
    } catch (error) {
      console.error("Lỗi khi đổi mật khẩu", error);
      toast.error(serverMessage(error, "Không đổi được mật khẩu"));
      return false;
    }
  },
}));
