"use server";

import { signIn } from "@/auth";

/**
 * Server-side OAuth kickoff (avoids client fetch/JSON issues behind ngrok interstitials).
 * Ensure NEXTAUTH_URL matches the browser origin and Google redirect URI is
 * {origin}/api/auth/callback/google
 */
export async function signInWithGoogleAction(formData: FormData) {
  const raw = formData.get("callbackUrl");
  const redirectTo =
    typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
  await signIn("google", { redirectTo });
}
