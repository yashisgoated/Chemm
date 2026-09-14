export type ThemeMode = "light" | "dark" | "system";

const THEME_KEY = "chemm_theme";

export function isFirebaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  );
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(THEME_KEY) as ThemeMode | null;
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

export function storeTheme(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_KEY, mode);
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "light" || mode === "dark") return mode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
