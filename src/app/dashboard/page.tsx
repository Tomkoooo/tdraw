import { auth } from "@/auth";
import {
  getMySheets,
  getSharedWithMeSheets,
  getSharedByMeSheets,
  getOrgSheets,
  getTrashedSheets,
} from "@/lib/actions/sheet";
import { listMyOrganizations } from "@/lib/actions/org";
import { listFolders, getTrashedFoldersPersonal } from "@/lib/actions/folder";
import { getPersonalDriveStorage, getOrganizationDriveStorage } from "@/lib/actions/storage";
import DashboardClient from "@/components/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await auth();
  const orgs = await listMyOrganizations();
  const orgSheetsEntries = await Promise.all(
    orgs.map(async (o) => [o._id, await getOrgSheets(o._id)] as const)
  );
  const orgSheetsByOrg = Object.fromEntries(orgSheetsEntries);

  const orgStorageEntries = await Promise.all(
    orgs.map(async (o) => [o._id, await getOrganizationDriveStorage(o._id)] as const)
  );
  const orgStorageByOrg = Object.fromEntries(orgStorageEntries);

  const [mine, shared, sharedByMe, personalFolders, trashedSheets, trashedFolders, personalStorage] = await Promise.all([
    getMySheets(),
    getSharedWithMeSheets(),
    getSharedByMeSheets(),
    listFolders({ ownerPersonal: true }),
    getTrashedSheets(),
    getTrashedFoldersPersonal(),
    getPersonalDriveStorage(),
  ]);

  const first = session?.user?.name?.split(" ")[0] || "User";
  const displayName = session?.user?.name ?? first;

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)]">
      <DashboardClient
        userId={session?.user?.id ?? ""}
        userFirstName={first}
        userDisplayName={displayName}
        userImage={session?.user?.image ?? null}
        mine={mine}
        shared={shared}
        sharedByMe={sharedByMe}
        orgs={orgs}
        orgSheetsByOrg={orgSheetsByOrg}
        personalFolders={personalFolders}
        trashedSheets={trashedSheets}
        trashedFolders={trashedFolders}
        personalStorage={personalStorage}
        orgStorageByOrg={orgStorageByOrg}
      />
    </div>
  );
}
