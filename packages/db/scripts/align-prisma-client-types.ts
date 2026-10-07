/**
 * Runs after `prisma generate`. The generated `PrismaClient` class interface
 * defaults its global-omit type to `undefined`, while the exported
 * `PrismaClient` alias and every `new PrismaClient(...)` instance use
 * `PrismaClientOptions["omit"]`. `Prisma.TransactionClient` is built from the
 * class default, so a transaction client and the real client carry different
 * model delegate types. TypeScript cannot relate those by identity or
 * variance and compares every model delegate structurally: each method call on
 * `DbClient` (`PrismaClient | TransactionClient`) and each client passed where
 * a transaction client is expected costs seconds to minutes and gigabytes.
 *
 * Aligning the class default with the alias makes all three identical. It is
 * a type-only change: global omit is not configured, so result types are the
 * same, and the generated runtime code is untouched.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const file = join(
  import.meta.dir,
  "..",
  "generated",
  "prisma",
  "internal",
  "class.ts",
)
const unaligned =
  "in out OmitOpts extends Prisma.PrismaClientOptions['omit'] = undefined,"
const aligned =
  "in out OmitOpts extends Prisma.PrismaClientOptions['omit'] = Prisma.PrismaClientOptions['omit'],"

const source = readFileSync(file, "utf8")
const occurrences = source.split(unaligned).length - 1
if (occurrences === 1) {
  writeFileSync(file, source.replace(unaligned, aligned))
  console.info("Aligned the generated PrismaClient omit default.")
} else if (occurrences === 0 && source.includes(aligned)) {
  console.info("Generated PrismaClient omit default already aligned.")
} else {
  // Fail loudly: a Prisma upgrade changed this output and needs a review.
  throw new Error(
    `Expected one PrismaClient omit default in ${file}, found ${occurrences}. Review scripts/align-prisma-client-types.ts after the Prisma upgrade.`,
  )
}
