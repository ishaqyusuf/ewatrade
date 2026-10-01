import type { PrismaClient } from "@ewatrade/db"

/** A legacy form token may only resolve to its own Store's published entry. */
export async function findPublishedEntryForLegacyServiceForm(
  db: Pick<PrismaClient, "customerEntryPoint">,
  formId: string,
) {
  return db.customerEntryPoint.findFirst({
    select: { publicToken: true },
    where: {
      status: "PUBLISHED",
      store: { serviceRequestForms: { some: { id: formId } } },
    },
  })
}
