import api from "@/lib/axios";
import type { User } from "@/types/user";
import type { ProfilePatch } from "@/types/store";

export const userService = {
  updateMe: async (patch: ProfilePatch): Promise<User> => {
    const res = await api.patch("/users/me", patch);
    return res.data.user;
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const res = await api.post("/users/me/password", { currentPassword, newPassword });
    return res.data as { message: string; signedOutSessions: number };
  },

  uploadAvatar: async (formData: FormData) => {
    const res = await api.post("/users/uploadAvatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    if (res.status === 400) {
      throw new Error(res.data.message);
    }

    return res.data;
  },
};
