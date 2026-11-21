import { create } from "zustand";
import { persist } from "zustand/middleware";

export const HEADER_SCENES = ["teal", "stars", "field", "sunset", "ocean", "snow"] as const;
export type HeaderScene = (typeof HEADER_SCENES)[number];

export const SCENE_LABELS: Record<HeaderScene, string> = {
  teal: "Cổ vịt",
  stars: "Bầu trời sao",
  field: "Cánh đồng",
  sunset: "Hoàng hôn",
  ocean: "Biển đêm",
  snow: "Núi tuyết",
};

interface HeaderSceneState {
  scene: HeaderScene;
  setScene: (scene: HeaderScene) => void;
}

// Nền header thanh bên; lưu theo trình duyệt giống chế độ tối (useThemeStore)
export const useHeaderSceneStore = create<HeaderSceneState>()(
  persist(
    (set) => ({
      scene: "teal",
      setScene: (scene) => set({ scene }),
    }),
    {
      name: "header-scene",
      // giá trị cũ / gõ tay không hợp lệ thì quay về mặc định
      merge: (persisted, current) => {
        const scene = (persisted as Partial<HeaderSceneState> | undefined)?.scene;
        return { ...current, scene: scene && HEADER_SCENES.includes(scene) ? scene : current.scene };
      },
    }
  )
);
