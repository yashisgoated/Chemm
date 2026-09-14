import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

export function GlassPanel({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn("glass-panel", className)} {...props}>
      {children}
    </div>
  );
}

export function GlassSurface({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn("glass-surface", className)} {...props}>
      {children}
    </div>
  );
}
