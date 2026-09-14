"use client";

import { ThemeProvider } from "@/features/theme/ThemeProvider";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { CallProvider } from "@/features/calls/CallProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CallProvider>{children}</CallProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
