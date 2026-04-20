import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTaskBoardData } from "@/lib/actions/task";
import { listMyOrganizations, listOrgMembersForAssignment } from "@/lib/actions/org";
import TasksKanbanBoard from "@/components/dashboard/TasksKanbanBoard";
import { ChevronLeft, KanbanSquare } from "lucide-react";

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
    <div className="min-h-screen bg-[var(--bg-canvas)] px-4 pb-32 pt-safe-top md:px-8">
      <div className="mx-auto max-w-[100rem] space-y-4 md:pt-4">
        <div className="glass-thick rounded-[1.75rem] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/dashboard"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-4 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
            >
              <ChevronLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <div className="flex items-center gap-2 rounded-2xl bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold">
              <KanbanSquare className="h-4 w-4 text-[var(--color-accent)]" />
              {activeOrg ? `${orgName ?? "Organization"} board` : "Personal board"}
            </div>
          </div>
          <h1 className="mt-4 text-2xl font-bold md:text-3xl">Tasks</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Drag cards across columns. Tap any card for details.</p>
        </div>
        <div className="glass-thick flex flex-wrap gap-2 rounded-[1.75rem] p-3">
          <Link
            href="/dashboard/tasks"
            className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold ${
              !activeOrg ? "bg-[var(--color-accent)] text-white" : "glass-panel"
            }`}
          >
            Personal
          </Link>
          {orgs.map((o) => (
            <Link
              key={o._id}
              href={`/dashboard/tasks?org=${o._id}`}
              className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold ${
                activeOrg === o._id ? "bg-[var(--color-accent)] text-white" : "glass-panel"
              }`}
            >
              {o.name}
            </Link>
          ))}
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
    </div>
  );
}
