import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { listIncomingInvitationsForSession } from "@/lib/actions/incomingInvites";
import IncomingInvitesClient from "@/components/dashboard/IncomingInvitesClient";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";

export default async function DashboardInvitesPage() {
  noStore();
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const { sheets, orgs } = await listIncomingInvitationsForSession();

  return <IncomingInvitesClient initialSheets={sheets} initialOrgs={orgs} />;
}
