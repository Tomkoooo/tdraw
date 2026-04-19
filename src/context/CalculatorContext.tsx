"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type CalculatorContextValue = {
  open: boolean;
  setOpen: (next: boolean) => void;
  toggle: () => void;
  registerCopyToCanvas: (fn: ((value: string) => void) | null) => void;
  runCopyToCanvas: (value: string) => void;
};

const CalculatorContext = createContext<CalculatorContextValue | null>(null);

export function CalculatorProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const copyHandlerRef = useRef<((value: string) => void) | null>(null);

  const registerCopyToCanvas = useCallback((fn: ((value: string) => void) | null) => {
    copyHandlerRef.current = fn;
  }, []);

  const runCopyToCanvas = useCallback((value: string) => {
    copyHandlerRef.current?.(value);
  }, []);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  const value: CalculatorContextValue = {
    open,
    setOpen,
    toggle,
    registerCopyToCanvas,
    runCopyToCanvas,
  };

  return <CalculatorContext.Provider value={value}>{children}</CalculatorContext.Provider>;
}

export function useCalculator() {
  const ctx = useContext(CalculatorContext);
  if (!ctx) throw new Error("useCalculator must be used within CalculatorProvider");
  return ctx;
}

export function useOptionalCalculator() {
  return useContext(CalculatorContext);
}
