import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { listEvents } from "@/lib/actions/calendar";
import { listMyOrganizations, listOrgMembersForAssignment } from "@/lib/actions/org";
import CalendarClient from "@/components/dashboard/CalendarClient";
import { CalendarDays, ChevronLeft } from "lucide-react";

export default async function CalendarPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const orgs = await listMyOrganizations();
  const personal = await listEvents("personal");
  const orgEvents = await Promise.all(
    orgs.map(async (o) => ({ orgId: o._id, orgName: o.name, events: await listEvents("org", o._id) }))
  );

  const orgMembersEntries = await Promise.all(
    orgs.map(async (o) => {
      const members = await listOrgMembersForAssignment(o._id);
      return [o._id, members.map((m) => ({ userId: m.userId, name: m.name, email: m.email }))] as const;
    })
  );
  const orgMembersByOrg = Object.fromEntries(orgMembersEntries);

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] px-4 pb-32 pt-safe-top md:px-8">
      <div className="mx-auto max-w-6xl space-y-4 md:pt-4">
        <div className="glass-thick rounded-[1.75rem] p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/dashboard"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-4 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
            >
              <ChevronLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <div className="flex items-center gap-2 rounded-2xl bg-[var(--input-bg)] px-3 py-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4 text-[var(--color-accent)]" />
              Personal + organization calendars
            </div>
          </div>
          <h1 className="mt-4 text-2xl font-bold md:text-3xl">Calendar</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Select to create, tap to inspect, and switch calendar layers without losing context.
          </p>
        </div>
        <CalendarClient
          personal={personal}
          orgBlocks={orgEvents}
          orgs={orgs}
          orgMembersByOrg={orgMembersByOrg}
          currentUserId={session.user.id}
        />
      </div>
    </div>
  );
}
