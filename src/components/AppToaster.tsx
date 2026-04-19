"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/components/ThemeProvider";

/** Global toast host — must render under `ThemeProvider` for light/dark. */
export default function AppToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      position="top-center"
      richColors
      closeButton
      expand
      offset="max(0.75rem, env(safe-area-inset-top))"
      toastOptions={{
        classNames: {
          toast: "glass-thick border-[var(--glass-border)] shadow-lg backdrop-blur-xl",
        },
      }}
    />
  );
}
