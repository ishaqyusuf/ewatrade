import { Prisma } from "../../generated/prisma/client"

/** Bun hot reload can retain a client whose error constructor predates this module. */
export function isPrismaTransactionWriteConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError)
    return error.code === "P2034"
  if (!(error instanceof Error)) return false
  const version = Reflect.get(error, "clientVersion")
  return (
    error.name === "PrismaClientKnownRequestError" &&
    Reflect.get(error, "code") === "P2034" &&
    typeof version === "string" &&
    version.trim().length > 0
  )
}
