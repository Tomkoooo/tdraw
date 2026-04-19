// src/components/SignInButton.tsx
import { signIn } from "@/auth";
import { LogIn } from "lucide-react";

export default function SignInButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/dashboard" });
      }}
    >
      <button
        type="submit"
        className="glass flex items-center justify-center gap-3 px-6 py-4 rounded-2xl w-full text-lg font-medium transition-all hover:scale-[1.02] active:scale-[0.98] text-[#0071E3] dark:text-[#0A84FF] shadow-[0_8px_30px_rgb(0,0,0,0.08)]"
      >
        <LogIn className="w-6 h-6" />
        Continue with Google
      </button>
    </form>
  );
}
