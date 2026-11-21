import { useId } from "react";
import type { HeaderScene as SceneId } from "@/stores/useHeaderSceneStore";
import { cn } from "@/lib/utils";

// Toạ độ cố định (không random) để ảnh thu nhỏ và header giống hệt nhau
const STARS = [
  [18, 10, 1.1], [46, 26, 0.8], [72, 8, 1.4], [98, 34, 0.9], [126, 14, 1], [150, 40, 0.7],
  [174, 6, 1.2], [200, 28, 0.9], [226, 12, 1.4], [250, 36, 0.8], [276, 18, 1.1], [300, 6, 0.9],
  [322, 30, 1.3], [344, 14, 0.8], [110, 52, 0.7], [236, 50, 0.8], [60, 46, 0.9], [330, 52, 0.7],
] as const;

const FLAKES = [
  [14, 0], [40, 2.4], [66, 1.1], [92, 3.6], [118, 0.6], [144, 2.9], [170, 1.7], [196, 4.2],
  [222, 0.3], [248, 2.1], [274, 3.3], [300, 1.4], [326, 4.6], [352, 0.9], [80, 5.1], [262, 5.4],
] as const;

const svgProps = {
  className: "absolute inset-0 size-full",
  viewBox: "0 0 360 80",
  preserveAspectRatio: "xMidYMax slice",
  "aria-hidden": true,
} as const;

/**
 * Nền động của header thanh bên. Vẽ bằng SVG + CSS (index.css, .scene-*), không tải ảnh ngoài.
 * `still`: ảnh thu nhỏ trong ô chọn nền, không chạy animation.
 */
const HeaderScene = ({ scene, still = false }: { scene: SceneId; still?: boolean }) => {
  // id gradient riêng cho mỗi bản (header + ảnh thu nhỏ cùng lúc), tránh trùng id trong trang
  const sky = `sky-${useId().replace(/:/g, "")}`;
  return (
  <div className={cn("pointer-events-none absolute inset-0", still && "scene-still")} aria-hidden="true">
    {scene === "teal" && <div className="absolute inset-0 bg-gradient-primary" />}

    {scene === "stars" && (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0B1430" />
            <stop offset="1" stopColor="#24346A" />
          </linearGradient>
        </defs>
        <rect width="360" height="80" fill={`url(#${sky})`} />
        {STARS.map(([x, y, r], i) => (
          <circle
            key={i}
            className="scene-twinkle"
            style={{ animationDelay: `${(i * 0.37) % 3}s` }}
            cx={x}
            cy={y}
            r={r}
            fill="#FFFFFF"
          />
        ))}
        {/* sao băng */}
        <line className="scene-meteor" x1="0" y1="0" x2="26" y2="9" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    )}

    {scene === "field" && (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2B3566" />
            <stop offset="0.7" stopColor="#7A5A86" />
            <stop offset="1" stopColor="#C98A6B" />
          </linearGradient>
        </defs>
        <rect width="360" height="80" fill={`url(#${sky})`} />
        <g className="scene-drift-slow">
          <ellipse cx="120" cy="22" rx="22" ry="5" fill="#FFFFFF" opacity="0.18" />
          <ellipse cx="300" cy="14" rx="28" ry="5" fill="#FFFFFF" opacity="0.14" />
        </g>
        <path d="M0 62 Q60 46 120 58 T240 54 T360 58 V80 H0Z" fill="#2E6B3E" />
        <path d="M0 70 Q90 58 180 68 T360 66 V80 H0Z" fill="#3F8A4E" />
        {/* vài khóm cỏ đung đưa */}
        {[40, 132, 214, 318].map((x, i) => (
          <path
            key={x}
            className="scene-sway"
            style={{ animationDelay: `${i * 0.6}s`, transformOrigin: `${x}px 72px` }}
            d={`M${x} 72 q-2 -7 -5 -10 M${x} 72 q0 -8 1 -12 M${x} 72 q3 -6 6 -9`}
            stroke="#6FBF6A"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
        ))}
      </svg>
    )}

    {scene === "sunset" && (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3B1F4A" />
            <stop offset="0.55" stopColor="#8E3B5A" />
            <stop offset="1" stopColor="#D2643A" />
          </linearGradient>
        </defs>
        <rect width="360" height="80" fill={`url(#${sky})`} />
        <circle className="scene-sun" cx="230" cy="74" r="18" fill="#F6B04A" opacity="0.9" />
        <g className="scene-drift">
          <ellipse cx="80" cy="30" rx="26" ry="4.5" fill="#F4C7A8" opacity="0.35" />
          <ellipse cx="300" cy="44" rx="22" ry="4" fill="#F4C7A8" opacity="0.3" />
        </g>
        <rect y="74" width="360" height="6" fill="#4A2036" />
      </svg>
    )}

    {scene === "ocean" && (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#081A30" />
            <stop offset="1" stopColor="#0E3A5F" />
          </linearGradient>
        </defs>
        <rect width="360" height="80" fill={`url(#${sky})`} />
        <circle cx="250" cy="18" r="8" fill="#F3EED9" opacity="0.9" />
        <rect className="scene-shimmer" x="244" y="56" width="12" height="2" rx="1" fill="#F3EED9" opacity="0.5" />
        {/* sóng rộng gấp đôi khung, trượt ngang nửa chiều rộng để lặp liền mạch */}
        <path
          className="scene-wave-slow"
          d="M0 60 q22 -6 45 0 t45 0 t45 0 t45 0 t45 0 t45 0 t45 0 t45 0 t45 0 t45 0 t45 0 t45 0 t45 0 t45 0 t45 0 t45 0 V80 H0Z"
          fill="#155A86"
          opacity="0.8"
        />
        <path
          className="scene-wave"
          d="M0 68 q18 -5 36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 V80 H0Z"
          fill="#1F78A8"
        />
      </svg>
    )}

    {scene === "snow" && (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1B2A44" />
            <stop offset="1" stopColor="#3C5A80" />
          </linearGradient>
        </defs>
        <rect width="360" height="80" fill={`url(#${sky})`} />
        {/* núi xa (xanh xám) và núi gần (trắng tuyết) */}
        <path d="M0 80 L40 46 L70 62 L120 30 L170 60 L210 40 L260 64 L300 36 L360 60 V80Z" fill="#8FA8C6" />
        <path d="M0 80 L60 54 L100 70 L160 48 L220 72 L280 50 L340 70 L360 64 V80Z" fill="#E9F0F8" />
        <path d="M120 30 L108 40 L116 38 L122 42 L130 37 L134 40Z M300 36 L289 46 L297 43 L303 47 L310 42Z" fill="#FFFFFF" />
        {FLAKES.map(([x, delay], i) => (
          <circle
            key={i}
            className="scene-snowfall"
            style={{ animationDelay: `${delay}s`, animationDuration: `${5 + (i % 4)}s` }}
            cx={x}
            // ảnh thu nhỏ đứng yên: rải bông tuyết sẵn trên trời thay vì xếp ở mép trên
            cy={still ? 6 + ((i * 13) % 44) : -4}
            r={i % 3 === 0 ? 1.6 : 1.1}
            fill="#FFFFFF"
          />
        ))}
      </svg>
    )}
  </div>
  );
};

export default HeaderScene;
