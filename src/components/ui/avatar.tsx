import * as React from "react";
import { Bot } from "lucide-react";
import { avatarColor } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface AvatarProps {
  name: string;
  /** `PlayerView.color` (0..7). */
  color: number;
  bot?: boolean;
  /** Pixel size of the circle. */
  size?: number;
  className?: string;
  /** Overlays (status dots, crowns…) positioned relative to the avatar. */
  children?: React.ReactNode;
}

/** Round player avatar: initial on a colour gradient (robot icon for bots). Decorative — pair with a visible name. */
export function Avatar({ name, color, bot, size = 40, className, children }: AvatarProps) {
  const hex = avatarColor(color);
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <div
      aria-hidden
      className={cn("relative grid shrink-0 select-none place-items-center rounded-full font-display font-bold text-white", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(135deg, ${hex}, ${hex}88)`,
        boxShadow: `inset 0 0 0 1.5px ${hex}, 0 0 16px ${hex}44`,
      }}
    >
      {bot ? <Bot style={{ width: size * 0.52, height: size * 0.52 }} /> : initial}
      {children}
    </div>
  );
}
