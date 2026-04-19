"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export default function LogoutButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/" })}
      className={`flex min-h-[44px] w-full touch-manipulation items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold text-gray-600 transition-[opacity,background-color] hover:bg-black/5 active:opacity-80 dark:text-gray-300 dark:hover:bg-white/10 ${className}`}
    >
      <LogOut className="h-4 w-4" />
      Sign Out
    </button>
  );
}
