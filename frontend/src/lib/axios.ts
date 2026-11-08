import { useAuthStore } from "@/stores/useAuthStore";
import axios, { type InternalAxiosRequestConfig } from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

// gắn access token vào req header
api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

// Chỉ có MỘT lần gọi /auth/refresh tại một thời điểm.
// Khi token hết hạn, nhiều request cùng nhận 403; trước đây mỗi request
// tự gọi refresh riêng. Giờ chúng cùng chờ một promise.
let refreshPromise: Promise<string> | null = null;

export const refreshAccessToken = (): Promise<string> => {
  if (refreshPromise) return refreshPromise;

  const promise: Promise<string> = api
    .post("/auth/refresh")
    .then((res) => {
      const token: string = res.data.accessToken;
      useAuthStore.getState().setAccessToken(token);
      return token;
    })
    .finally(() => {
      refreshPromise = null;
    });

  refreshPromise = promise;
  return promise;
};

const SKIP_REFRESH = ["/auth/signin", "/auth/signup", "/auth/refresh"];

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

// tự động gọi refresh api khi access token hết hạn
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config as RetriableConfig | undefined;

    if (
      !originalRequest ||
      SKIP_REFRESH.some((url) => originalRequest.url?.includes(url))
    ) {
      return Promise.reject(error);
    }

    // mỗi request chỉ thử lại một lần để tránh vòng lặp vô hạn
    if (error.response?.status === 403 && !originalRequest._retried) {
      originalRequest._retried = true;

      try {
        const newAccessToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().clearState();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
