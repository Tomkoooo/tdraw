import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  providers: [], 
  pages: {
    signIn: '/', 
  },
  callbacks: {
    async session({ session, token }) {
      if (token?.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
} satisfies NextAuthConfig;
