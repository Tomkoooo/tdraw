import { getSheet } from "@/lib/actions/sheet";
import { getHotbarToolIds } from "@/lib/actions/settings";
import { redirect } from "next/navigation";
import ExcalidrawEditor from "@/components/ExcalidrawEditor";
import { auth } from "@/auth";

export default async function SheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const [sheet, hotbarToolIds] = await Promise.all([getSheet(id), getHotbarToolIds()]);

  if (!sheet) {
    redirect("/dashboard");
  }

  return (
    <ExcalidrawEditor
      key={sheet._id}
      sheetId={sheet._id}
      initialData={sheet.canvasState}
      title={sheet.title}
      canWrite={sheet.canWrite}
      canTitle={sheet.canTitle}
      contentVersion={sheet.contentVersion}
      initialServerUpdatedAt={sheet.updatedAt}
      hotbarToolIds={hotbarToolIds}
      userName={session?.user?.name ?? null}
      userImage={session?.user?.image ?? null}
      userId={session?.user?.id}
      organizationId={sheet.organizationId}
    />
  );
}
