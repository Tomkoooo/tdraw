import SignInButton from "@/components/SignInButton";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-[var(--bg-canvas)]">
      {/* Abstract Background Shapes */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#0071E3] rounded-full mix-blend-multiply filter blur-[120px] opacity-20"></div>
      <div className="absolute top-[20%] right-[-10%] w-[50%] h-[50%] bg-[#FF2D55] rounded-full mix-blend-multiply filter blur-[120px] opacity-20"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-[50%] h-[50%] bg-[#5856D6] rounded-full mix-blend-multiply filter blur-[120px] opacity-20"></div>

      <div className="z-10 flex flex-col items-center w-full px-6">
        <div className="glass p-10 rounded-[2.5rem] flex flex-col items-center text-center shadow-2xl mb-8 border border-white/20 dark:border-white/10 max-w-md w-full">
          <div className="w-24 h-24 bg-gradient-to-br from-[#0071E3] to-[#5856D6] rounded-[2rem] flex items-center justify-center mb-8 shadow-xl shadow-blue-500/20">
            <svg
              className="w-12 h-12 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-r from-[var(--color-text)] to-gray-400">
            tDraw
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-xl font-medium mb-10">
            The premium iPad-first note-taking experience.
          </p>
          <div className="w-full">
            <SignInButton />
          </div>
        </div>
      </div>
    </div>
  );
}
