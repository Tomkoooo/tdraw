import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrganizationMeta, listOrganizationMembers } from "@/lib/actions/org";
import OrgManageClient from "@/components/dashboard/OrgManageClient";
import UserAvatar from "@/components/UserAvatar";

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
    <div className="mx-auto max-w-3xl p-6 md:p-10">
      <Link href="/dashboard" className="mb-6 inline-block text-sm font-semibold text-[var(--color-accent)]">
        ← Dashboard
      </Link>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{meta.name}</h1>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
        <UserAvatar image={session?.user?.image} name={session?.user?.name} size="sm" />
        <span>
          Signed in as <span className="font-semibold text-gray-900 dark:text-gray-100">{session?.user?.name}</span>
          <span className="text-gray-500"> · Role: {meta.role}</span>
        </span>
      </div>
      <OrgManageClient organizationId={id} members={members} isAdmin={meta.role === "admin"} />
    </div>
  );
}
