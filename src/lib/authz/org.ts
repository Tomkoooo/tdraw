import mongoose from "mongoose";
import OrganizationMember from "@/lib/models/OrganizationMember";
import type { OrgMemberRole } from "@/lib/models/Organization";

export async function getOrgMembership(
  userId: string,
  organizationId: string
): Promise<OrgMemberRole | null> {
  const m = await OrganizationMember.findOne({
    organizationId: new mongoose.Types.ObjectId(organizationId),
    userId: new mongoose.Types.ObjectId(userId),
  })
    .select("role")
    .lean();
  return (m?.role as OrgMemberRole) ?? null;
}

export async function requireOrgMember(userId: string, organizationId: string) {
  const role = await getOrgMembership(userId, organizationId);
  if (!role) throw new Error("Forbidden");
  return role;
}

export async function requireOrgAdmin(userId: string, organizationId: string) {
  const role = await requireOrgMember(userId, organizationId);
  if (role !== "admin") throw new Error("Forbidden");
}
