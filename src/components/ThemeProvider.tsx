"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ThemeMode = "system" | "light" | "dark";

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (m: ThemeMode) => void;
};

const STORAGE_KEY = "tdraw-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readSystemDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
}

function applyDomTheme(resolved: "light" | "dark", enableTransition: boolean) {
  const root = document.documentElement;
  if (enableTransition) {
    root.setAttribute("data-theme-transition", "on");
    requestAnimationFrame(() => {
      root.setAttribute("data-theme", resolved);
      window.setTimeout(() => root.removeAttribute("data-theme-transition"), 320);
    });
  } else {
    root.removeAttribute("data-theme-transition");
    root.setAttribute("data-theme", resolved);
  }
}

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* ignore */
  }
  return "system";
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  /** Must match SSR and the first client render — never read `localStorage` here (hydration mismatch). */
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [systemDark, setSystemDark] = useState(false);
  const [mounted, setMounted] = useState(false);
  const firstThemeApply = useRef(true);

  useLayoutEffect(() => {
    setModeState(readStoredMode());
    setSystemDark(readSystemDark());
    setMounted(true);
  }, []);

  const resolved: "light" | "dark" = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  useEffect(() => {
    if (!mounted) return;
    const withTransition = !firstThemeApply.current;
    firstThemeApply.current = false;
    applyDomTheme(resolved, withTransition);
  }, [resolved, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mounted]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/** Hydration-safe: only render theme-dependent UI after mount. */