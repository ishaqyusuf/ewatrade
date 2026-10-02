import { prisma } from "@ewatrade/db"
import { resolveRetailOpsStaffInviteToken } from "@ewatrade/db/staff-onboarding"

export async function getStaffWebInvitation(token: string) {
  const invite = await resolveRetailOpsStaffInviteToken(prisma, { token })
  if (!invite.membershipId) throw new Error("This invitation is unavailable.")
  const membership = await prisma.membership.findUnique({
    where: { id: invite.membershipId },
    select: {
      role: true,
      status: true,
      user: {
        select: {
          id: true,
          email: true,
          ageBand: true,
          name: true,
          accounts: {
            where: { providerId: "credential" },
            select: { password: true },
          },
        },
      },
      tenant: { select: { isActive: true } },
    },
  })
  if (
    !membership ||
    !membership.tenant.isActive ||
    membership.status !== "INVITED" ||
    membership.role !== invite.role ||
    membership.user.email.toLowerCase() !== invite.email.toLowerCase()
  )
    throw new Error(
      "This invitation is no longer available. Ask the business owner for a new link.",
    )
  const { accounts, ...user } = membership.user
  return {
    ...invite,
    user,
    needsPassword: !accounts.some((account) => Boolean(account.password)),
  }
}
