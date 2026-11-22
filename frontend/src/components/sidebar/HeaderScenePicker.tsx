import { Check, Palette } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { HEADER_SCENES, SCENE_LABELS, useHeaderSceneStore } from "@/stores/useHeaderSceneStore";
import HeaderScene from "./HeaderScene";
import { cn } from "@/lib/utils";

// Nút bảng màu trên header: chọn nền, đổi ngay (không có nút lưu)
const HeaderScenePicker = () => {
  const { scene, setScene } = useHeaderSceneStore();

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Đổi nền header"
        title="Đổi nền header"
        className="flex size-8 items-center justify-center rounded-full text-white/90 outline-none transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70 data-[popup-open]:bg-white/20"
      >
        <Palette className="size-[18px]" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-2 p-3">
        <p className="text-sm font-medium">Nền header</p>
        <div role="radiogroup" aria-label="Nền header" className="grid grid-cols-2 gap-2">
          {HEADER_SCENES.map((id) => {
            const selected = scene === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setScene(id)}
                className="group/scene flex flex-col gap-1.5 rounded-lg p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "relative block h-14 overflow-hidden rounded-md ring-offset-2 ring-offset-popover transition-shadow",
                    selected ? "ring-2 ring-primary" : "ring-1 ring-border group-hover/scene:ring-primary/50"
                  )}
                >
                  <HeaderScene scene={id} still />
                  {selected && (
                    <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3.5 stroke-3" />
                    </span>
                  )}
                </span>
                <span className={cn("px-0.5 text-xs", selected ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {SCENE_LABELS[id]}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default HeaderScenePicker;
