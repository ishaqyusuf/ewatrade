import { Prisma } from "../generated/prisma/client"
import type { DbClient } from "./types"

export type CreateTenantStoreInput = {
  tenantId: string
  name: string
  currencyCode?: string
  supportEmail?: string | null
  supportPhone?: string | null
}

export type CreatedTenantStore = {
  id: string
  slug: string
  name: string
  status: string
}

function toSlug(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
}

export async function createTenantStore(
  db: DbClient,
  input: CreateTenantStoreInput,
): Promise<CreatedTenantStore> {
  const baseSlug = toSlug(input.name) || "store"
  const currencyCode = input.currencyCode?.toUpperCase() ?? "NGN"

  for (let attempt = 0; attempt < 50; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`
    const existing = await db.store.findUnique({
      where: { tenantId_slug: { tenantId: input.tenantId, slug } },
      select: { id: true },
    })

    if (existing) continue

    try {
      return await db.store.create({
        data: {
          tenantId: input.tenantId,
          slug,
          name: input.name,
          currencyCode,
          supportEmail: input.supportEmail ?? null,
          supportPhone: input.supportPhone ?? null,
          status: "ACTIVE",
        },
        select: { id: true, slug: true, name: true, status: true },
      })
    } catch (error) {
      if (isUniqueConstraintError(error)) continue
      throw error
    }
  }

  throw new Error("Unable to generate a unique store slug.")
}
