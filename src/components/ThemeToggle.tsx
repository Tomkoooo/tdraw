"use client";

import { Moon, Monitor, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { mode, setMode } = useTheme();

  const cycle = () => {
    if (mode === "system") setMode("light");
    else if (mode === "light") setMode("dark");
    else setMode("system");
  };

  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  const label =
    mode === "system" ? "Theme: system (tap for light)" : mode === "light" ? "Theme: light" : "Theme: dark";

  return (
    <button
      type="button"
      onClick={cycle}
      title={label}
      aria-label={label}
      className={`glass-panel inline-flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-2xl animate-micro hover:lift-sm active:opacity-80 ${className}`}
    >
      <Icon className="h-[1.15rem] w-[1.15rem] text-[var(--color-accent)]" aria-hidden />
    </button>
  );
}
