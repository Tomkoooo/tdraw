import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getHotbarToolIds, setHotbarToolIds } from "@/lib/actions/settings";
import HotbarSettingsForm from "@/components/settings/HotbarSettingsForm";
import { ALL_DEFAULT_HOTBAR_TOOL_IDS } from "@/lib/tldraw/defaultHotbarToolIds";
import ThemeToggle from "@/components/ThemeToggle";
import { ChevronLeft, Palette, PencilRuler } from "lucide-react";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const selected = await getHotbarToolIds();

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] px-4 pb-32 pt-safe-top md:px-8">
      <div className="mx-auto mt-4 max-w-3xl space-y-4 md:mt-8">
        <div className="glass-thick rounded-[1.75rem] p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/dashboard"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-4 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
            >
              <ChevronLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <ThemeToggle />
          </div>
        </div>
        <div className="glass-thick rounded-[1.75rem] p-6 md:p-8">
          <div className="mb-6 flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-accent)]/14 text-[var(--color-accent)]">
              <Palette className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
              <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                Keep tDraw calm and predictable. Theme and toolbar options are tuned for touch and pencil flow.
              </p>
            </div>
          </div>
          <div className="mb-6 rounded-3xl border border-[var(--glass-border)] bg-[var(--input-bg)] p-4">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <PencilRuler className="h-4 w-4 text-[var(--color-accent)]" />
              Editing toolbar
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Pick the tools that appear first on your canvas toolbar for faster sketching and note capture.
            </p>
          </div>
          <HotbarSettingsForm
            allIds={[...ALL_DEFAULT_HOTBAR_TOOL_IDS]}
            initialSelected={selected}
            saveAction={setHotbarToolIds}
          />
        </div>
      </div>
    </div>
  );
}
