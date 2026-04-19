import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import dbConnect from "@/lib/db/mongoose";
import User from "@/lib/models/User";
import { authConfig } from "./auth.config";
import { reconcileInvitesForUser } from "@/lib/share/reconcileInvitesForUser";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  /** Required when the public URL host differs from the machine (e.g. ngrok, reverse proxy). */
  trustHost:
    process.env.AUTH_TRUST_HOST === "true" ||
    process.env.AUTH_TRUST_HOST === "1" ||
    process.env.NODE_ENV !== "production",
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
          if (user.email) {
            await reconcileInvitesForUser(dbUser._id.toString(), user.email);
          }
          return true;
        } catch (error) {
          console.error("Error signing in", error);
          return false;
        }
      }
      return false;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        await dbConnect();
        const dbUser = await User.findOne({ email: user.email });
        if (dbUser) {
          token.sub = dbUser._id.toString();
          await reconcileInvitesForUser(dbUser._id.toString(), user.email);
        }
      }
      return token;
    },
  },
});
