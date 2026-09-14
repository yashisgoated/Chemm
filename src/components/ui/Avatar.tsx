"use client";

import { memo } from "react";
import { cn, initialsFromName } from "@/lib/utils";

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  online?: boolean;
  className?: string;
}

const sizes = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-xs",
  lg: "h-14 w-14 text-base",
  xl: "h-28 w-28 text-3xl",
};

const dotSizes = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
  xl: "h-4 w-4",
};

export const Avatar = memo(function Avatar({
  name,
  src,
  size = "md",
  online,
  className,
}: AvatarProps) {
  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className={cn(
          "overflow-hidden rounded-full bg-gradient-to-br from-sky-400/90 to-cyan-600/90 text-white font-semibold flex items-center justify-center shadow-[0_8px_24px_rgba(14,165,233,0.25)] ring-1 ring-white/40",
          sizes[size],
        )}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span>{initialsFromName(name)}</span>
        )}
      </div>
      {online !== undefined && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-2 border-white/80",
            online ? "bg-emerald-400" : "bg-slate-300",
            dotSizes[size],
          )}
          aria-hidden
        />
      )}
    </div>
  );
});
