"use client";

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "glass-input w-full h-11 px-4 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:ring-2 focus:ring-sky-400/40",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "glass-input w-full px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:ring-2 focus:ring-sky-400/40 resize-none",
        className,
      )}
      {...props}
    />
  );
});
