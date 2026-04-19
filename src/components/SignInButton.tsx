import { LogIn } from "lucide-react";
import { signInWithGoogleAction } from "@/lib/actions/googleSignIn";

export default function SignInButton({ redirectTo = "/dashboard" }: { redirectTo?: string }) {
  const safe =
    redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/dashboard";

  return (
    <form action={signInWithGoogleAction} className="w-full">
      <input type="hidden" name="callbackUrl" value={safe} />
      <button
        type="submit"
        className="glass pointer-events-auto relative z-10 flex min-h-[48px] w-full touch-manipulation items-center justify-center gap-3 rounded-2xl px-6 py-4 text-lg font-medium text-[#0071E3] shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-[opacity,background-color] [transform:translateZ(0)] active:opacity-90 dark:text-[#0A84FF] [@media(hover:hover)]:hover:bg-[color-mix(in_srgb,var(--glass-bg)_88%,var(--color-accent)_8%)]"
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        <LogIn className="h-6 w-6" />
        Continue with Google
      </button>
    </form>
  );
}
