import { getSheet } from "@/lib/actions/sheet";
import { redirect } from "next/navigation";
import TldrawEditor from "@/components/TldrawEditor";

export default async function SheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sheet = await getSheet(id);

  if (!sheet) {
    redirect("/dashboard");
  }

  return (
    <TldrawEditor
      key={sheet._id}
      sheetId={sheet._id}
      initialData={sheet.canvasState}
      title={sheet.title}
    />
  );
}
