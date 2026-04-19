import { auth } from "@/auth";
import { peekSheetInviteToken, acceptSheetInviteByToken } from "@/lib/actions/share";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function InviteSheetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth();
  const peek = await peekSheetInviteToken(token);

  if (!peek) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="text-lg font-semibold">This invitation is invalid or expired.</p>
        <Link href="/dashboard" className="mt-4 text-[var(--color-accent)]">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (!session?.user?.id) {
    redirect(`/?callbackUrl=${encodeURIComponent(`/invite/sheet/${token}`)}`);
  }

  try {
    const { sheetId } = await acceptSheetInviteByToken(token);
    redirect(`/sheet/${sheetId}`);
  } catch {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
        <p className="max-w-md text-lg font-semibold">Could not accept this invite.</p>
        <p className="mt-2 text-sm text-gray-500">
          Signed in as {session.user.email}. This invite was sent to {peek.email}.
        </p>
        <Link href="/dashboard" className="mt-6 text-[var(--color-accent)]">
          Dashboard
        </Link>
      </div>
    );
  }
}
