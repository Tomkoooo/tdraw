import { auth } from "@/auth";
import { getSheets } from "@/lib/actions/sheet";
import LogoutButton from "@/components/LogoutButton";
import CreateSheetButton from "@/components/CreateSheetButton";
import Link from "next/link";
import { Pencil } from "lucide-react";

export default async function Dashboard() {
  const session = await auth();
  const sheets = await getSheets();

  return (
    <div className="min-h-screen p-6 md:p-8 max-w-[1400px] mx-auto pb-32">
      <header className="flex items-center justify-between mb-12 glass rounded-[2.5rem] p-4 md:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] top-6 sticky z-50">
        <div className="flex items-center gap-4">
          {session?.user?.image ? (
            <img src={session.user.image} alt="Avatar" className="w-14 h-14 rounded-full border-[3px] border-white dark:border-[#252528] shadow-sm ml-2" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-blue-500/20 ml-2" />
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Good to see you, {session?.user?.name?.split(' ')[0] || "User"}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Your thoughts, safely synced.</p>
          </div>
        </div>
        <LogoutButton />
      </header>

      <main>
        <section>
          <div className="flex items-center justify-between mb-6 px-4">
             <h2 className="text-xl font-bold">Recent Notes</h2>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            <CreateSheetButton />

            {sheets.map((sheet: any) => (
              <Link 
                key={sheet._id} 
                href={`/sheet/${sheet._id}`}
                className="glass p-6 rounded-[2rem] aspect-[4/3] flex flex-col hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm hover:shadow-md group relative overflow-hidden"
              >
                <div className="flex-1 flex items-center justify-center mb-4 relative z-10 w-full h-full bg-white/50 dark:bg-black/20 rounded-2xl overflow-hidden">
                  {sheet.previewImage ? (
                    <img src={sheet.previewImage} alt={sheet.title} className="w-full h-full object-cover" />
                  ) : (
                     <Pencil className="w-10 h-10 text-gray-300 dark:text-gray-600 transition-colors group-hover:text-[var(--color-accent)]" />
                  )}
                </div>
                <div className="mt-auto relative z-10 pl-2">
                  <h3 className="font-semibold text-lg truncate tracking-tight">{sheet.title}</h3>
                  <p className="text-xs text-gray-500 font-medium mt-1 uppercase tracking-wider">{new Date(sheet.updatedAt).toLocaleDateString()}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
