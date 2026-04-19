"use client";

import { type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { CalculatorProvider, useCalculator } from "@/context/CalculatorContext";
import GlobalBottomDock from "@/components/GlobalBottomDock";
import FloatingCalculator from "@/components/FloatingCalculator";

function GlobalFloatingCalculator() {
  const pathname = usePathname() ?? "";
  const isSheet = pathname.startsWith("/sheet/");
  const { status } = useSession();
  const { open, setOpen, runCopyToCanvas } = useCalculator();

  if (status !== "authenticated") return null;

  return (
    <FloatingCalculator
      open={open}
      onOpenChange={setOpen}
      hideFabWhenClosed={!isSheet}
      fabBottomClass="bottom-[max(1rem,env(safe-area-inset-bottom))] md:bottom-[max(1.25rem,env(safe-area-inset-bottom))]"
      onCopyToCanvas={runCopyToCanvas}
    />
  );
}

function GlobalLayoutBody({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const { status } = useSession();
  const showDock =
    !pathname.startsWith("/sheet/") &&
    (status === "authenticated" ||
      (status === "loading" && (pathname.startsWith("/dashboard") || pathname.startsWith("/settings"))));

  return (
    <>
      <div className={`min-h-0 ${showDock ? "pb-[calc(5.5rem+env(safe-area-inset-bottom))]" : ""}`}>
        {children}
      </div>
      {showDock ? <GlobalBottomDock /> : null}
      <GlobalFloatingCalculator />
    </>
  );
}

/**
 * Global calculator (all authenticated routes) + bottom dock (everywhere except the canvas).
 */
export default function GlobalAppChrome({ children }: { children: ReactNode }) {
  return (
    <CalculatorProvider>
      <GlobalLayoutBody>{children}</GlobalLayoutBody>
    </CalculatorProvider>
  );
}
