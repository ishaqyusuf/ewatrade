import { AccountAgeBand } from "../../generated/prisma/enums"
import { isEligibleAccountAgeBand } from "./store-conversation-age-authority"
import {
  projectTenantContext,
  tenantContextMembershipSelect,
} from "./tenant-context-membership"
import type { DbClient } from "./types"

const eligibleBands = Object.values(AccountAgeBand).filter(
  isEligibleAccountAgeBand,
)

/** One current GET preference/scope projection; no protected profile for undeclared age. */
export async function getWorkspaceReadPreference(
  db: Pick<DbClient, "membership">,
  input: {
    userId: string
    tenantSlug: string
    storeId: string | null
    qaScope?: { tenantId: string; membershipId: string } | null
  },
) {
  const row = await db.membership.findFirst({
    where: {
      userId: input.userId,
      status: "ACTIVE",
      tenant: { slug: input.tenantSlug, isActive: true },
    },
    select: {
      id: true,
      user: {
        select: {
          ageBand: true,
          memberships: {
            where: {
              userId: input.userId,
              status: "ACTIVE",
              tenant: { slug: input.tenantSlug, isActive: true },
              user: { ageBand: { in: eligibleBands } },
              ...(input.qaScope
                ? {
                    id: input.qaScope.membershipId,
                    tenantId: input.qaScope.tenantId,
                  }
                : {}),
            },
            select: tenantContextMembershipSelect,
            take: 1,
          },
        },
      },
    },
  })
  if (!row) return null
  const membership = row.user.memberships[0]
  return {
    id: row.id,
    user: { ageBand: row.user.ageBand },
    scope:
      membership?.id === row.id
        ? {
            input: {
              userId: input.userId,
              tenantSlug: input.tenantSlug,
              storeId: input.storeId,
            },
            tenantContext: projectTenantContext(membership, input.storeId),
          }
        : null,
  }
}
