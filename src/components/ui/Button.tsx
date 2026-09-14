"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-white shadow-[0_12px_32px_color-mix(in_oklab,var(--accent)_40%,transparent)] hover:brightness-110 active:scale-[0.98]",
  secondary:
    "glass-button text-[var(--ink)] hover:brightness-105 active:scale-[0.98]",
  ghost:
    "bg-transparent text-[var(--ink-muted)] hover:bg-white/10 active:scale-[0.98]",
  danger:
    "bg-[var(--danger)] text-white shadow-[0_12px_32px_color-mix(in_oklab,var(--danger)_35%,transparent)] hover:brightness-110 active:scale-[0.98]",
  success:
    "bg-[var(--success)] text-white shadow-[0_12px_32px_color-mix(in_oklab,var(--success)_35%,transparent)] hover:brightness-110 active:scale-[0.98]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-xl",
  md: "h-11 px-4 text-sm rounded-2xl",
  lg: "h-12 px-5 text-base rounded-2xl",
  icon: "h-11 w-11 rounded-2xl inline-flex items-center justify-center",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "primary", size = "md", type = "button", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      />
    );
  },
);
