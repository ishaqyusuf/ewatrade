import { Prisma } from "../../generated/prisma/client"

/** Source-owned identifiers only. No caller can select a table, SQL expression or actor column. */
export const accountPrivacyRecordSources = {
  customerMessageTemplate: {
    table: "CustomerMessageTemplate",
    actors: ["updatedByUserId"],
    category: "SHARED",
    tenant: 'r."tenantId"',
    nullable: ["updatedByUserId"],
    scrub: [],
  },
  commercialOrder: {
    table: "CommercialOrder",
    actors: ["createdByUserId"],
    category: "ACCOUNTING",
    tenant: 'r."tenantId"',
    nullable: [],
    scrub: [],
  },
  commercialPayment: {
    table: "CommercialOrderPayment",
    actors: ["recordedByUserId"],
    category: "ACCOUNTING",
    tenant: 'r."tenantId"',
    nullable: [],
    scrub: [],
  },
  commercialFulfillment: {
    table: "CommercialOrderFulfillmentCommand",
    actors: ["actorUserId"],
    category: "ACCOUNTING",
    tenant: 'r."tenantId"',
    nullable: [],
    scrub: [],
  },
  productReturn: {
    table: "ProductReturn",
    actors: ["actorUserId"],
    category: "ACCOUNTING",
    tenant: 'r."tenantId"',
    nullable: [],
    scrub: [],
  },
  legacyMessage: {
    table: "Message",
    actors: ["senderUserId"],
    category: "SHARED",
    tenant:
      '(SELECT c."tenantId" FROM "Conversation" c WHERE c.id=r."conversationId")',
    nullable: ["senderUserId"],
    scrub: [
      { field: "body", value: "[Removed at account deletion]" },
      { field: "externalMessageId", value: null },
    ],
  },
  automationEvent: {
    table: "AutomationEvent",
    actors: ["actorUserId"],
    category: "SHARED",
    tenant: 'r."tenantId"',
    nullable: ["actorUserId"],
    scrub: [
      { field: "payload", value: null },
      { field: "errorMessage", value: null },
    ],
  },
} as const
export type AccountPrivacyRecordFamily =
  keyof typeof accountPrivacyRecordSources
export const ACCOUNT_PRIVACY_RECORD_FAMILIES = Object.keys(
  accountPrivacyRecordSources,
) as AccountPrivacyRecordFamily[]
export type AccountPrivacyRecordSnapshot = {
  family: AccountPrivacyRecordFamily
  recordId: string
  tenantId: string
  actorField: string
  subjectId: string
  sourceCreatedAt: Date
  sourceEvidenceDigest: string
  category: "ACCOUNTING" | "SHARED"
}

function identifier(value: string) {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(value))
    throw Error("INVALID_SOURCE_IDENTIFIER")
  return Prisma.raw(`"${value}"`)
}
/** PostgreSQL hashes the exact JSONB representation; private values/decimal precision never enter API projections or JS parsing. */
export async function accountPrivacyRecordSnapshot(
  tx: Prisma.TransactionClient,
  input: {
    family: AccountPrivacyRecordFamily
    recordId: string
    subjectId: string
  },
) {
  const source = accountPrivacyRecordSources[input.family]
  const rows = await tx.$queryRaw<
    {
      record: Prisma.JsonObject
      tenantId: string
      sourceEvidenceDigest: string
      sourceCreatedAt: Date
    }[]
  >(
    Prisma.sql`SELECT jsonb_build_object('createdAt',r."createdAt", ${Prisma.join(source.actors.map((field) => Prisma.sql`${field}::text,${identifier(field)}`))}) AS record, encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') AS "sourceEvidenceDigest", r."createdAt" AT TIME ZONE 'UTC' AS "sourceCreatedAt", ${Prisma.raw(source.tenant)} AS "tenantId" FROM ${identifier(source.table)} r WHERE r.id=${input.recordId} FOR UPDATE`,
  )
  const row = rows[0]
  if (!row || typeof row.tenantId !== "string") return []
  const createdAt = row.sourceCreatedAt
  if (!(createdAt instanceof Date) || !Number.isFinite(createdAt.getTime()))
    throw Error("SOURCE_DATE_REQUIRED")
  const sourceEvidenceDigest = row.sourceEvidenceDigest
  if (!/^[a-f0-9]{64}$/.test(sourceEvidenceDigest))
    throw Error("SOURCE_EVIDENCE_UNAVAILABLE")
  return source.actors
    .filter((field) => row.record[field] === input.subjectId)
    .map((actorField) => ({
      family: input.family,
      recordId: input.recordId,
      tenantId: row.tenantId,
      actorField,
      subjectId: input.subjectId,
      sourceCreatedAt: createdAt,
      sourceEvidenceDigest,
      category: source.category,
    }))
}
/** Redact only this subject's nullable/plain-string attribution; financial amounts and another actor's rows never change. */
export async function expireAccountPrivacyRecordSource(
  tx: Prisma.TransactionClient,
  row: {
    recordFamily: string
    recordId: string
    actorField: string
    subjectUserId: string
    tenantId: string
  },
) {
  const family = ACCOUNT_PRIVACY_RECORD_FAMILIES.find(
    (value) => value === row.recordFamily,
  )
  if (!family) throw Error("UNSUPPORTED_RECORD_FAMILY")
  const source = accountPrivacyRecordSources[family]
  if (!source.actors.some((field) => field === row.actorField))
    throw Error("UNSUPPORTED_ACTOR_FIELD")
  const nullable: readonly string[] = source.nullable
  const statements = [
    Prisma.sql`${identifier(row.actorField)}=${nullable.includes(row.actorField) ? null : "account-privacy-expired"}`,
  ]
  for (const scrub of source.scrub)
    statements.push(Prisma.sql`${identifier(scrub.field)}=${scrub.value}`)
  // A completed automation may be scrubbed; never discard queued or in-flight work.
  const settled =
    family === "automationEvent"
      ? Prisma.sql`AND r.status::text IN ('COMPLETED','FAILED')`
      : Prisma.empty
  const changed = await tx.$executeRaw(
    Prisma.sql`UPDATE ${identifier(source.table)} r SET ${Prisma.join(statements)} WHERE r.id=${row.recordId} AND ${identifier(row.actorField)}=${row.subjectUserId} AND ${Prisma.raw(source.tenant)}=${row.tenantId} ${settled}`,
  )
  if (!changed) {
    const remaining = await accountPrivacyRecordSnapshot(tx, {
      family,
      recordId: row.recordId,
      subjectId: row.subjectUserId,
    })
    if (remaining.some((item) => item.actorField === row.actorField))
      throw Error("SOURCE_WORK_UNRESOLVED")
  }
  return changed
}

/** One bounded query per source family; hashes are computed inside PostgreSQL, not from lossy JS numbers. */
export async function listAccountPrivacySubjectRecordSnapshots(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  subjectId: string,
  families: readonly AccountPrivacyRecordFamily[],
) {
  const records: AccountPrivacyRecordSnapshot[] = []
  for (const family of families) {
    const source = accountPrivacyRecordSources[family]
    const predicate = Prisma.join(
      source.actors.map(
        (field) => Prisma.sql`${identifier(field)}=${subjectId}`,
      ),
      " OR ",
    )
    const rows = await tx.$queryRaw<
      {
        id: string
        tenantId: string
        sourceCreatedAt: Date
        sourceEvidenceDigest: string
        actors: Prisma.JsonObject
      }[]
    >(
      Prisma.sql`SELECT r.id, ${Prisma.raw(source.tenant)} AS "tenantId", r."createdAt" AT TIME ZONE 'UTC' AS "sourceCreatedAt", encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') AS "sourceEvidenceDigest",jsonb_build_object(${Prisma.join(source.actors.map((field) => Prisma.sql`${field}::text,${identifier(field)}`))}) AS actors FROM ${identifier(source.table)} r WHERE (${predicate}) ORDER BY r.id LIMIT 5001`,
    )
    if (rows.length > 5000) throw Error("RETENTION_SCOPE_TOO_LARGE")
    for (const row of rows) {
      if (
        !row.tenantId ||
        !(row.sourceCreatedAt instanceof Date) ||
        !Number.isFinite(row.sourceCreatedAt.getTime()) ||
        !/^[a-f0-9]{64}$/.test(row.sourceEvidenceDigest)
      )
        throw Error("RETENTION_SCOPE_UNAVAILABLE")
      for (const field of source.actors)
        if (row.actors[field] === subjectId)
          records.push({
            family,
            recordId: row.id,
            tenantId: row.tenantId,
            actorField: field,
            subjectId,
            sourceCreatedAt: row.sourceCreatedAt,
            sourceEvidenceDigest: row.sourceEvidenceDigest,
            category: source.category,
          })
    }
  }
  return records
}
