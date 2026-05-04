import Link from "next/link";
import ExcalidrawEditor from "@/components/ExcalidrawEditor";
import { getSheetForPublicShareToken } from "@/lib/actions/share";
import { ALL_DEFAULT_HOTBAR_TOOL_IDS } from "@/lib/tldraw/defaultHotbarToolIds";

const defaultHotbar = [...ALL_DEFAULT_HOTBAR_TOOL_IDS];

export default async function PublicShareSheetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sheet = await getSheetForPublicShareToken(token);

  if (!sheet) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="text-lg font-semibold">This link is invalid, expired, or no longer available.</p>
        <p className="mt-2 max-w-md text-center text-sm text-gray-500">
          The owner may have revoked it, or the note may have been removed.
        </p>
        <Link href="/" className="mt-6 text-[var(--color-accent)]">
          Home
        </Link>
      </div>
    );
  }

  return (
    <ExcalidrawEditor
      key={sheet._id}
      sheetId={sheet._id}
      initialData={sheet.canvasState}
      title={sheet.title}
      canWrite={false}
      canTitle={false}
      contentVersion={sheet.contentVersion}
      initialServerUpdatedAt={sheet.updatedAt}
      hotbarToolIds={defaultHotbar}
      userName="Guest"
      userImage={null}
      userId={undefined}
      organizationId={sheet.organizationId}
      showSharePanel={false}
      shareReadToken={token}
      sharePublicLaserMode
    />
  );
}
