import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getHotbarToolIds, setHotbarToolIds } from "@/lib/actions/settings";
import HotbarSettingsForm from "@/components/settings/HotbarSettingsForm";
import { ALL_DEFAULT_HOTBAR_TOOL_IDS } from "@/lib/tldraw/defaultHotbarToolIds";
import ThemeToggle from "@/components/ThemeToggle";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const selected = await getHotbarToolIds();

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] px-4 pb-24 pt-safe-top md:px-8">
      <div className="glass-thick mx-auto mt-4 max-w-2xl rounded-[2rem] p-6 shadow-xl md:mt-8 md:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Link href="/dashboard" className="text-sm font-semibold text-[var(--color-accent)]">
            ← Dashboard
          </Link>
          <ThemeToggle />
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          Customize the drawing toolbar and theme. An empty tool selection restores all default tools.
        </p>

        <HotbarSettingsForm allIds={[...ALL_DEFAULT_HOTBAR_TOOL_IDS]} initialSelected={selected} saveAction={setHotbarToolIds} />
      </div>
    </div>
  );
}
