import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTaskBoardData } from "@/lib/actions/task";
import { listMyOrganizations, listOrgMembersForAssignment } from "@/lib/actions/org";
import TasksKanbanBoard from "@/components/dashboard/TasksKanbanBoard";

export default async function TasksPage({
  searchParams,
}: {
  searchParams?: Promise<{ org?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const sp = (await searchParams) ?? {};
  const orgParam = typeof sp.org === "string" && sp.org.length > 0 ? sp.org : null;

  const orgs = await listMyOrganizations();
  const activeOrg = orgParam && orgs.some((o) => o._id === orgParam) ? orgParam : null;

  const board = activeOrg ? await getTaskBoardData("org", activeOrg) : await getTaskBoardData("personal");

  const members = activeOrg
    ? await listOrgMembersForAssignment(activeOrg)
    : ([] as { userId: string; name: string; email: string }[]);

  const orgName = activeOrg ? orgs.find((o) => o._id === activeOrg)?.name : undefined;

  return (
    <div className="mx-auto max-w-[100rem] p-4 md:p-8">
      <Link href="/dashboard" className="mb-4 inline-block text-sm font-semibold text-[var(--color-accent)]">
        ← Dashboard
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {activeOrg ? `${orgName ?? "Organization"} board` : "Personal board"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/tasks"
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              !activeOrg ? "bg-[var(--color-accent)] text-white" : "glass-panel"
            }`}
          >
            Personal
          </Link>
          {orgs.map((o) => (
            <Link
              key={o._id}
              href={`/dashboard/tasks?org=${o._id}`}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                activeOrg === o._id ? "bg-[var(--color-accent)] text-white" : "glass-panel"
              }`}
            >
              {o.name}
            </Link>
          ))}
        </div>
      </div>
      <TasksKanbanBoard
        scope={activeOrg ? "org" : "personal"}
        organizationId={activeOrg ?? undefined}
        organizationName={orgName}
        columns={board.columns}
        tasks={board.tasks}
        members={members}
        currentUserId={session.user.id}
      />
    </div>
  );
}
