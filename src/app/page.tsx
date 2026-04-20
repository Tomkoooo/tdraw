import SignInButton from "@/components/SignInButton";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PencilLine } from "lucide-react";

export default async function Home({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const session = await auth();
  if (session) {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const callbackUrl =
    sp.callbackUrl && sp.callbackUrl.startsWith("/") && !sp.callbackUrl.startsWith("//")
      ? sp.callbackUrl
      : "/dashboard";

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-x-hidden bg-[var(--bg-canvas)] px-6">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute -left-[20%] top-[-15%] h-[55vmin] w-[55vmin] rounded-full bg-[var(--color-accent)] opacity-[0.12] blur-[100px]" />
        <div className="absolute -right-[15%] bottom-[-20%] h-[45vmin] w-[45vmin] rounded-full bg-[var(--color-accent)] opacity-[0.08] blur-[90px]" />
      </div>

      <div className="relative z-[100] isolate flex w-full max-w-xl flex-col items-center pointer-events-auto">
        <div className="glass-thick pointer-events-auto relative z-10 mb-8 flex w-full flex-col items-center rounded-[2.25rem] p-8 text-center shadow-2xl md:p-12">
          <div className="mb-7 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-[var(--color-accent)]/14 text-[var(--color-accent)] shadow-inner">
            <PencilLine className="h-11 w-11" strokeWidth={2.2} />
          </div>
          <h1 className="mb-3 text-5xl font-extrabold tracking-tight text-[var(--color-text)] md:text-6xl">tDraw</h1>
          <p className="mb-2 text-base font-semibold text-[var(--color-accent)]">iPad + Apple Pencil first</p>
          <p className="mb-10 max-w-md text-base leading-relaxed text-gray-500 dark:text-gray-400">
            A calm canvas workspace for handwriting, sketching, and collaboration. Minimal chrome, fluid touch targets, and
            real-time sync.
          </p>
          <div className="w-full">
            <SignInButton redirectTo={callbackUrl} />
          </div>
        </div>
      </div>
    </div>
  );
}
