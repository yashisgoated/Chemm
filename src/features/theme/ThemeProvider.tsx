"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getStoredTheme,
  resolveTheme,
  storeTheme,
  type ThemeMode,
} from "@/lib/mode";

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function initialMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  return getStoredTheme();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    resolveTheme(initialMode()),
  );

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setResolved(mq.matches ? "dark" : "light");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    storeTheme(next);
    setResolved(resolveTheme(next));
  }, []);

  const toggle = useCallback(() => {
    setMode(resolved === "dark" ? "light" : "dark");
  }, [resolved, setMode]);

  const value = useMemo(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
