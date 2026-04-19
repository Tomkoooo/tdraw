import { signOut } from "@/auth";
import { LogOut } from "lucide-react";

export default function LogoutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <button
        type="submit"
        className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all hover:bg-black/5 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 active:scale-95"
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>
    </form>
  );
}
