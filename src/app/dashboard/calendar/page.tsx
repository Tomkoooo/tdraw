import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { listEvents } from "@/lib/actions/calendar";
import { listMyOrganizations, listOrgMembersForAssignment } from "@/lib/actions/org";
import CalendarClient from "@/components/dashboard/CalendarClient";

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
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      <Link href="/dashboard" className="mb-6 inline-block text-sm font-semibold text-[var(--color-accent)]">
        ← Dashboard
      </Link>
      <h1 className="text-2xl font-bold">Calendar</h1>
      <CalendarClient
        personal={personal}
        orgBlocks={orgEvents}
        orgs={orgs}
        orgMembersByOrg={orgMembersByOrg}
        currentUserId={session.user.id}
      />
    </div>
  );
}
