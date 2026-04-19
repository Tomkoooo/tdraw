import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import dbConnect from "@/lib/db/mongoose";
import User from "@/lib/models/User";
import { authConfig } from "./auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        await dbConnect();
        try {
          let dbUser = await User.findOne({ providerId: account.providerAccountId });
          if (!dbUser) {
            dbUser = await User.create({
              email: user.email,
              name: user.name,
              image: user.image,
              providerId: account.providerAccountId,
            });
          }
          user.id = dbUser._id.toString();
          return true;
        } catch (error) {
          console.error("Error signing in", error);
          return false;
        }
      }
      return false;
    },
    async jwt({ token, user }) {
      if (user) {
        await dbConnect();
        const dbUser = await User.findOne({ email: user.email });
        if (dbUser) {
          token.sub = dbUser._id.toString();
        }
      }
      return token;
    },
  },
});
