import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrganizationMeta, listOrganizationMembers } from "@/lib/actions/org";
import OrgManageClient from "@/components/dashboard/OrgManageClient";
import UserAvatar from "@/components/UserAvatar";
import { Building2, ChevronLeft } from "lucide-react";

export default async function OrgManagePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const { id } = await params;
  let meta: { name: string; role: string };
  let members: Awaited<ReturnType<typeof listOrganizationMembers>> = [];
  try {
    meta = await getOrganizationMeta(id);
    members = await listOrganizationMembers(id);
  } catch {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] px-4 pb-32 pt-safe-top md:px-8">
      <div className="mx-auto max-w-4xl space-y-4 md:pt-4">
        <div className="glass-thick rounded-[1.75rem] p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={`/dashboard?node=org&org=${id}`}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-4 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to org
            </Link>
            <div className="flex items-center gap-2 rounded-2xl bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-[var(--color-accent)]" />
              Role: {meta.role}
            </div>
          </div>
          <h1 className="mt-4 text-2xl font-bold md:text-3xl">{meta.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <UserAvatar image={session?.user?.image} name={session?.user?.name} size="sm" />
            <span>
              Signed in as <span className="font-semibold text-gray-900 dark:text-gray-100">{session?.user?.name}</span>
            </span>
          </div>
        </div>
        <div className="glass-thick rounded-[1.75rem] p-4 md:p-6">
          <OrgManageClient organizationId={id} members={members} isAdmin={meta.role === "admin"} />
        </div>
      </div>
    </div>
  );
}
