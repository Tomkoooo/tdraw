import { auth } from "@/auth";
import {
  getMySheets,
  getRootDriveSheets,
  getRootOrgSheets,
  getSharedWithMeSheets,
  getSharedByMeSheets,
  getOrgSheets,
  getTrashedSheets,
  getFolderSheets,
} from "@/lib/actions/sheet";
import { listMyOrganizations } from "@/lib/actions/org";
import { getFolderTree, getTrashedFoldersPersonal } from "@/lib/actions/folder";
import { getPersonalDriveStorage, getOrganizationDriveStorage } from "@/lib/actions/storage";
import LibraryShell from "@/components/library/LibraryShell";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";

type Search = {
  node?: string;
  org?: string;
  sw?: string;
  folder?: string;
  newFolder?: string;
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<Search> }) {
  noStore();
  const session = await auth();
  const sp = (await searchParams) ?? {};
  const orgs = await listMyOrganizations();
  const orgSheetsEntries = await Promise.all(orgs.map(async (o) => [o._id, await getOrgSheets(o._id)] as const));
  const orgSheetsByOrg = Object.fromEntries(orgSheetsEntries);

  const orgRootEntries = await Promise.all(orgs.map(async (o) => [o._id, await getRootOrgSheets(o._id)] as const));
  const orgRootByOrg = Object.fromEntries(orgRootEntries);

  const orgStorageEntries = await Promise.all(orgs.map(async (o) => [o._id, await getOrganizationDriveStorage(o._id)] as const));
  const orgStorageByOrg = Object.fromEntries(orgStorageEntries);

  const orgFolderTreeEntries = await Promise.all(
    orgs.map(async (o) => [o._id, await getFolderTree({ organizationId: o._id })] as const)
  );
  const orgFolderTreeByOrg = Object.fromEntries(orgFolderTreeEntries);

  const [
    mine,
    rootDriveSheets,
    personalFolderTree,
    shared,
    sharedByMe,
    trashedSheets,
    trashedFolders,
    personalStorage,
  ] = await Promise.all([
    getMySheets(),
    getRootDriveSheets(),
    getFolderTree({ ownerPersonal: true }),
    getSharedWithMeSheets(),
    getSharedByMeSheets(),
    getTrashedSheets(),
    getTrashedFoldersPersonal(),
    getPersonalDriveStorage(),
  ]);

  const folderQ = sp.folder;
  const initialFolderId = folderQ && folderQ.length > 0 ? folderQ : null;
  let initialFolderSheets = null;
  if (initialFolderId) {
    try {
      initialFolderSheets = await getFolderSheets(initialFolderId);
    } catch {
      initialFolderSheets = null;
    }
  }

  const first = session?.user?.name?.split(" ")[0] || "User";
  const displayName = session?.user?.name ?? first;

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)]">
      <LibraryShell
        userId={session?.user?.id ?? ""}
        userFirstName={first}
        userDisplayName={displayName}
        userImage={session?.user?.image ?? null}
        mine={mine}
        homeSheets={mine}
        rootDriveSheets={rootDriveSheets}
        shared={shared}
        sharedByMe={sharedByMe}
        orgs={orgs}
        orgSheetsByOrg={orgSheetsByOrg}
        orgRootByOrg={orgRootByOrg}
        personalFolderTree={personalFolderTree}
        orgFolderTreeByOrg={orgFolderTreeByOrg}
        trashedSheets={trashedSheets}
        trashedFolders={trashedFolders}
        personalStorage={personalStorage}
        orgStorageByOrg={orgStorageByOrg}
        initialFolderId={initialFolderId}
        initialFolderSheets={initialFolderSheets}
      />
    </div>
  );
}
