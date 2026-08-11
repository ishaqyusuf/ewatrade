import { createHash } from "node:crypto"
import { BlockList, isIP } from "node:net"

const INVENTORY_RELATIONS = [
  "_prisma_migrations",
  "CashierSession",
  "CommerceQuote",
  "CommerceQuoteLine",
  "CommerceQuoteOption",
  "CommerceQuoteOptionSelection",
  "CommerceQuoteReplayAccessToken",
  "CommerceQuoteVersion",
  "CommercialOrder",
  "CommercialOrderFulfillmentCommand",
  "CommercialOrderLine",
  "CommercialOrderPayment",
  "CommercialOrderReminderDelivery",
  "CommercialOrderReminderSettings",
  "InventoryItem",
  "Order",
  "OrderItem",
  "Product",
  "ProductVariant",
  "ServiceQuote",
  "ServiceQuoteLine",
  "ServiceQuoteVersion",
  "Store",
] as const

const ALLOWED_MIGRATION_SQLSTATES = new Set(["42P01"])
const METADATA_ROW_LIMIT = 512
const MIGRATION_ROW_LIMIT = 256
const localAddresses = new BlockList()
localAddresses.addSubnet("127.0.0.0", 8, "ipv4")
localAddresses.addSubnet("10.0.0.0", 8, "ipv4")
localAddresses.addSubnet("172.16.0.0", 12, "ipv4")
localAddresses.addSubnet("192.168.0.0", 16, "ipv4")
localAddresses.addSubnet("169.254.0.0", 16, "ipv4")
localAddresses.addAddress("0.0.0.0", "ipv4")
localAddresses.addAddress("::", "ipv6")
localAddresses.addAddress("::1", "ipv6")
localAddresses.addSubnet("::ffff:7f00:0", 104, "ipv6")
localAddresses.addSubnet("fc00::", 7, "ipv6")
localAddresses.addSubnet("fe80::", 10, "ipv6")

type Environment = Readonly<Record<string, string | undefined>>

export type ServiceCommerceProductionDriftInventoryClient = {
  execute(sql: string): Promise<unknown>
  query<T>(sql: string, params?: readonly unknown[]): Promise<T>
}

type MigrationLedgerRow = {
  applied_steps_count: number
  error_code: string | null
  finished_at: Date | string | null
  migration_name: string
  rolled_back_at: Date | string | null
}

type TableRow = { table_name: string }
type RolePrivilegeRow = {
  all_present_tables_selectable: boolean
  any_database_create_or_temp_privilege: boolean
  any_non_system_schema_create_privilege: boolean
  any_non_system_sequence_write_privilege: boolean
  any_non_system_table_write_privilege: boolean
  any_security_definer_execute_privilege: boolean
  elevated_role: boolean
  owns_non_system_object: boolean
}
type ColumnRow = {
  column_name: string
  data_type: string
  is_nullable: "NO" | "YES"
  table_name: string
}
type IndexRow = {
  columns: string[]
  has_expression_or_predicate: boolean
  is_primary: boolean
  is_unique: boolean
  name: string
  table_name: string
}
type ConstraintRow = {
  columns: string[]
  kind: string
  name: string
  referenced_table: string | null
  table_name: string
}

function inventoryError(code: string): never {
  throw new Error(code)
}

function normalizedHostname(url: URL) {
  return url.hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
}

function assertSafeConnectionOptions(url: URL, requireStrictTls: boolean) {
  if (url.hash) inventoryError("PRODUCTION_DATABASE_URL_INVALID")

  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key)
    const allowed =
      (key === "sslmode" &&
        values.length === 1 &&
        ["require", "verify-full"].includes(values[0] ?? "")) ||
      (key === "channel_binding" &&
        values.length === 1 &&
        values[0] === "require")
    if (!allowed) inventoryError("PRODUCTION_DATABASE_URL_OPTIONS_FORBIDDEN")
  }

  if (
    requireStrictTls &&
    (url.searchParams.getAll("sslmode").length !== 1 ||
      url.searchParams.get("sslmode") !== "verify-full")
  ) {
    inventoryError("PRODUCTION_DATABASE_URL_STRICT_TLS_REQUIRED")
  }
}

function parseHostedPostgresUrl(
  value: string | undefined,
  options: { requireStrictTls?: boolean } = {},
) {
  if (!value?.trim()) inventoryError("PRODUCTION_DATABASE_URL_MISSING")

  let url: URL
  try {
    url = new URL(value)
  } catch {
    inventoryError("PRODUCTION_DATABASE_URL_INVALID")
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    inventoryError("PRODUCTION_DATABASE_URL_INVALID")
  }
  const hostname = normalizedHostname(url)
  if (
    !hostname ||
    !url.username ||
    !url.password ||
    !url.pathname ||
    url.pathname === "/"
  ) {
    inventoryError("PRODUCTION_DATABASE_URL_IDENTITY_INCOMPLETE")
  }

  const localHostname =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".docker.internal") ||
    hostname === "mysql" ||
    hostname === "postgres"
  const addressFamily = isIP(hostname)
  const localAddress =
    (addressFamily === 4 && localAddresses.check(hostname, "ipv4")) ||
    (addressFamily === 6 && localAddresses.check(hostname, "ipv6"))

  if (localHostname || localAddress) {
    inventoryError("PRODUCTION_DATABASE_URL_LOCAL")
  }
  assertSafeConnectionOptions(url, options.requireStrictTls ?? false)
  return url
}

function normalizedTarget(url: URL) {
  return {
    database: decodeURIComponent(url.pathname),
    hostname: normalizedHostname(url),
    port: url.port || "5432",
    protocol: "postgresql:",
  }
}

function printableHost(hostname: string) {
  return hostname.includes(":") ? `[${hostname}]` : hostname
}

export function serviceCommerceProductionDriftInventoryTargetFingerprint(
  databaseUrl: string,
) {
  const url = parseHostedPostgresUrl(databaseUrl, { requireStrictTls: true })
  const identity = createHash("sha256")
    .update(decodeURIComponent(url.username))
    .digest("hex")
    .slice(0, 8)
  const target = normalizedTarget(url)

  return `${target.protocol}//${printableHost(target.hostname)}:${target.port}${target.database}#identity=${identity}`
}

export function assertServiceCommerceProductionDriftInventoryEnvironment(
  environment: Environment,
) {
  if (
    environment.APP_ENV !== "production" ||
    environment.DEV_PROFILE !== "prod" ||
    environment.DATABASE_PROFILE_VERIFIED !== "1" ||
    environment.SERVICE_COMMERCE_PRODUCTION_DRIFT_INVENTORY_AUTHORIZED !== "1"
  ) {
    inventoryError("PRODUCTION_DRIFT_INVENTORY_NOT_AUTHORIZED")
  }

  const applicationUrl = parseHostedPostgresUrl(environment.DATABASE_URL)
  const readonlyUrl = parseHostedPostgresUrl(
    environment.PRODUCTION_READONLY_DATABASE_URL,
    { requireStrictTls: true },
  )
  if (
    JSON.stringify(normalizedTarget(applicationUrl)) !==
    JSON.stringify(normalizedTarget(readonlyUrl))
  ) {
    inventoryError("PRODUCTION_DRIFT_INVENTORY_TARGET_MISMATCH")
  }
  if (
    decodeURIComponent(applicationUrl.username) ===
    decodeURIComponent(readonlyUrl.username)
  ) {
    inventoryError("PRODUCTION_DRIFT_INVENTORY_REQUIRES_READONLY_ROLE")
  }

  const fingerprint = serviceCommerceProductionDriftInventoryTargetFingerprint(
    readonlyUrl.href,
  )
  if (
    environment.SERVICE_COMMERCE_PRODUCTION_DRIFT_INVENTORY_TARGET_FINGERPRINT !==
    fingerprint
  ) {
    inventoryError("PRODUCTION_DRIFT_INVENTORY_FINGERPRINT_MISMATCH")
  }

  return { fingerprint, readonlyDatabaseUrl: readonlyUrl.href }
}

function migrationState(row: MigrationLedgerRow) {
  if (row.rolled_back_at) return "ROLLED_BACK" as const
  if (row.finished_at) return "FINISHED" as const
  return "UNFINISHED" as const
}

function safeErrorCode(value: string | null | undefined) {
  return value && ALLOWED_MIGRATION_SQLSTATES.has(value) ? value : null
}

function sortByName<T extends { name: string }>(values: T[]) {
  return values.sort((left, right) => left.name.localeCompare(right.name))
}

function assertCompleteMetadata(...rowSets: readonly unknown[][]) {
  if (rowSets.some((rows) => rows.length > METADATA_ROW_LIMIT)) {
    inventoryError("PRODUCTION_DRIFT_INVENTORY_SCHEMA_METADATA_TRUNCATED")
  }
}

export async function collectServiceCommerceProductionDriftInventory(
  client: ServiceCommerceProductionDriftInventoryClient,
  input: { expectedMigrationNames: readonly string[] },
) {
  let began = false
  let rolledBack = false

  try {
    await client.execute("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
    began = true
    await client.execute("SET LOCAL statement_timeout = '5000ms'")
    await client.execute("SET LOCAL lock_timeout = '1000ms'")
    await client.execute(
      "SET LOCAL idle_in_transaction_session_timeout = '10000ms'",
    )

    const readOnly = await client.query<
      Array<{ transaction_read_only: string }>
    >("SHOW transaction_read_only")
    if (readOnly[0]?.transaction_read_only !== "on") {
      inventoryError("PRODUCTION_DRIFT_INVENTORY_NOT_READ_ONLY")
    }

    const tableRows = await client.query<TableRow[]>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [INVENTORY_RELATIONS],
    )
    const rolePrivileges = await client.query<RolePrivilegeRow[]>(
      `SELECT
        has_database_privilege(current_user, current_database(), 'CREATE') OR
          has_database_privilege(current_user, current_database(), 'TEMP')
          AS any_database_create_or_temp_privilege,
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_namespace AS writable_namespace
          WHERE writable_namespace.nspname <> 'information_schema'
            AND writable_namespace.nspname !~ '^pg_'
            AND has_schema_privilege(
              current_user,
              writable_namespace.oid,
              'CREATE'
            )
        ) AS any_non_system_schema_create_privilege,
        EXISTS (
          SELECT 1
          FROM pg_catalog.pg_class AS writable_relation
          JOIN pg_catalog.pg_namespace AS writable_relation_namespace
            ON writable_relation_namespace.oid = writable_relation.relnamespace
          WHERE writable_relation_namespace.nspname <> 'information_schema'
            AND writable_relation_namespace.nspname !~ '^pg_'
            AND writable_relation.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND has_table_privilege(
              current_user,
              writable_relation.oid,
              'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
            )
        ) AS any_non_system_table_write_privilege,
        EXISTS (
          SELECT 1
          FROM pg_catalog.pg_class AS writable_sequence
          JOIN pg_catalog.pg_namespace AS writable_sequence_namespace
            ON writable_sequence_namespace.oid = writable_sequence.relnamespace
          WHERE writable_sequence_namespace.nspname <> 'information_schema'
            AND writable_sequence_namespace.nspname !~ '^pg_'
            AND writable_sequence.relkind = 'S'
            AND has_sequence_privilege(
              current_user,
              writable_sequence.oid,
              'USAGE,UPDATE'
            )
        ) AS any_non_system_sequence_write_privilege,
        EXISTS (
          SELECT 1
          FROM pg_catalog.pg_proc AS executable_function
          JOIN pg_catalog.pg_namespace AS executable_function_namespace
            ON executable_function_namespace.oid = executable_function.pronamespace
          WHERE executable_function_namespace.nspname <> 'information_schema'
            AND executable_function_namespace.nspname !~ '^pg_'
            AND executable_function.prosecdef
            AND has_function_privilege(
              current_user,
              executable_function.oid,
              'EXECUTE'
            )
        ) AS any_security_definer_execute_privilege,
        EXISTS (
          SELECT 1
          FROM pg_catalog.pg_class AS owned_relation
          JOIN pg_catalog.pg_namespace AS owned_relation_namespace
            ON owned_relation_namespace.oid = owned_relation.relnamespace
          JOIN pg_catalog.pg_roles AS owning_role
            ON owning_role.oid = owned_relation.relowner
          WHERE owned_relation_namespace.nspname <> 'information_schema'
            AND owned_relation_namespace.nspname !~ '^pg_'
            AND owning_role.rolname = current_user
        ) OR EXISTS (
          SELECT 1
          FROM pg_catalog.pg_proc AS owned_function
          JOIN pg_catalog.pg_namespace AS owned_function_namespace
            ON owned_function_namespace.oid = owned_function.pronamespace
          JOIN pg_catalog.pg_roles AS function_owning_role
            ON function_owning_role.oid = owned_function.proowner
          WHERE owned_function_namespace.nspname <> 'information_schema'
            AND owned_function_namespace.nspname !~ '^pg_'
            AND function_owning_role.rolname = current_user
        ) AS owns_non_system_object,
        COALESCE((
          SELECT role.rolsuper OR role.rolcreaterole OR role.rolcreatedb OR
            role.rolreplication OR role.rolbypassrls
          FROM pg_catalog.pg_roles AS role
          WHERE role.rolname = current_user
        ), true) AS elevated_role,
        COALESCE(
          bool_and(has_table_privilege(current_user, relation.oid, 'SELECT')),
          true
        ) AS all_present_tables_selectable
       FROM pg_catalog.pg_class AS relation
       JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relkind IN ('r', 'p')
         AND relation.relname = ANY($1::text[])`,
      [INVENTORY_RELATIONS],
    )
    const role = rolePrivileges[0]
    if (
      !role?.all_present_tables_selectable ||
      role.any_database_create_or_temp_privilege ||
      role.any_non_system_schema_create_privilege ||
      role.any_non_system_sequence_write_privilege ||
      role.any_non_system_table_write_privilege ||
      role.any_security_definer_execute_privilege ||
      role.elevated_role ||
      role.owns_non_system_object
    ) {
      inventoryError("PRODUCTION_DRIFT_INVENTORY_ROLE_NOT_READONLY")
    }

    const ledgerRowsRaw = await client.query<MigrationLedgerRow[]>(
      `SELECT migration_name, applied_steps_count, finished_at, rolled_back_at,
        substring(logs from 'Database error code: (42P01)') AS error_code
       FROM "_prisma_migrations"
       ORDER BY started_at, migration_name
       LIMIT 257`,
    )
    if (ledgerRowsRaw.length > MIGRATION_ROW_LIMIT) {
      inventoryError("PRODUCTION_DRIFT_INVENTORY_MIGRATION_LEDGER_TRUNCATED")
    }
    const ledgerRows = ledgerRowsRaw

    const columnRowsRaw = await client.query<ColumnRow[]>(
      `SELECT table_name, column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])
       ORDER BY table_name, ordinal_position
       LIMIT 513`,
      [INVENTORY_RELATIONS],
    )
    const indexRowsRaw = await client.query<IndexRow[]>(
      `WITH inventory_indexes AS (
        SELECT table_relation.oid AS table_oid,
          table_relation.relname AS table_name,
          index_relation.oid AS index_oid,
          index_relation.relname AS name,
          index_meta.indkey,
          index_meta.indisunique AS is_unique,
          index_meta.indisprimary AS is_primary,
          (index_meta.indexprs IS NOT NULL OR index_meta.indpred IS NOT NULL)
            AS has_expression_or_predicate
        FROM pg_catalog.pg_index AS index_meta
        JOIN pg_catalog.pg_class AS table_relation
          ON table_relation.oid = index_meta.indrelid
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = table_relation.relnamespace
        JOIN pg_catalog.pg_class AS index_relation
          ON index_relation.oid = index_meta.indexrelid
        WHERE namespace.nspname = 'public'
          AND table_relation.relname = ANY($1::text[])
      )
      SELECT inventory_indexes.table_name,
        inventory_indexes.name,
        COALESCE(
          array_agg(attribute.attname ORDER BY key.ordinality)
            FILTER (WHERE attribute.attname IS NOT NULL),
          ARRAY[]::name[]
        )::text[] AS columns,
        inventory_indexes.is_unique,
        inventory_indexes.is_primary,
        inventory_indexes.has_expression_or_predicate
      FROM inventory_indexes
      LEFT JOIN LATERAL unnest(inventory_indexes.indkey)
        WITH ORDINALITY AS key(attnum, ordinality) ON true
      LEFT JOIN pg_catalog.pg_attribute AS attribute
        ON attribute.attrelid = inventory_indexes.table_oid
       AND attribute.attnum = key.attnum
       AND key.attnum > 0
      GROUP BY inventory_indexes.table_name, inventory_indexes.name,
        inventory_indexes.index_oid, inventory_indexes.is_unique,
        inventory_indexes.is_primary,
        inventory_indexes.has_expression_or_predicate
      ORDER BY inventory_indexes.table_name, inventory_indexes.name
      LIMIT 513`,
      [INVENTORY_RELATIONS],
    )
    const constraintRowsRaw = await client.query<ConstraintRow[]>(
      `SELECT table_relation.relname AS table_name,
        constraint_meta.conname AS name,
        CASE constraint_meta.contype
          WHEN 'p' THEN 'PRIMARY_KEY'
          WHEN 'u' THEN 'UNIQUE'
          WHEN 'f' THEN 'FOREIGN_KEY'
          WHEN 'c' THEN 'CHECK'
          WHEN 'x' THEN 'EXCLUSION'
          ELSE 'OTHER'
        END AS kind,
        COALESCE(
          array_agg(attribute.attname ORDER BY key.ordinality)
            FILTER (WHERE attribute.attname IS NOT NULL),
          ARRAY[]::name[]
        )::text[] AS columns,
        referenced_relation.relname AS referenced_table
       FROM pg_catalog.pg_constraint AS constraint_meta
       JOIN pg_catalog.pg_class AS table_relation
         ON table_relation.oid = constraint_meta.conrelid
       JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = table_relation.relnamespace
       LEFT JOIN pg_catalog.pg_class AS referenced_relation
         ON referenced_relation.oid = constraint_meta.confrelid
       LEFT JOIN LATERAL unnest(constraint_meta.conkey)
         WITH ORDINALITY AS key(attnum, ordinality) ON true
       LEFT JOIN pg_catalog.pg_attribute AS attribute
         ON attribute.attrelid = table_relation.oid
        AND attribute.attnum = key.attnum
       WHERE namespace.nspname = 'public'
         AND table_relation.relname = ANY($1::text[])
       GROUP BY table_relation.relname, constraint_meta.conname,
         constraint_meta.contype, referenced_relation.relname,
         constraint_meta.oid
       ORDER BY table_relation.relname, constraint_meta.conname
       LIMIT 513`,
      [INVENTORY_RELATIONS],
    )
    assertCompleteMetadata(columnRowsRaw, indexRowsRaw, constraintRowsRaw)
    const columnRows = columnRowsRaw
    const indexRows = indexRowsRaw
    const constraintRows = constraintRowsRaw

    const present = new Set(tableRows.map((row) => row.table_name))
    const expected = [...new Set(input.expectedMigrationNames)].sort()
    const expectedSet = new Set(expected)
    const ledgerByName = new Map(
      ledgerRows.map((row) => [row.migration_name, row] as const),
    )
    const expectedRows = expected.map((name) => {
      const ledger = ledgerByName.get(name)
      return ledger
        ? {
            appliedStepsCount: Number(ledger.applied_steps_count),
            errorCode: safeErrorCode(ledger.error_code),
            name,
            state: migrationState(ledger),
          }
        : {
            appliedStepsCount: 0,
            errorCode: null,
            name,
            state: "UNAPPLIED" as const,
          }
    })
    const unknownLedgerRows = ledgerRows.filter(
      (row) => !expectedSet.has(row.migration_name),
    )

    const schemaTables = INVENTORY_RELATIONS.map((name) => ({
      columns: sortByName(
        columnRows
          .filter((row) => row.table_name === name)
          .map((row) => ({
            name: row.column_name,
            nullable: row.is_nullable === "YES",
            type: row.data_type,
          })),
      ),
      constraints: sortByName(
        constraintRows
          .filter((row) => row.table_name === name)
          .map((row) => ({
            columns: [...row.columns],
            kind: row.kind,
            name: row.name,
            referencedTable: row.referenced_table,
          })),
      ),
      indexes: sortByName(
        indexRows
          .filter((row) => row.table_name === name)
          .map((row) => ({
            columns: [...row.columns],
            hasExpressionOrPredicate: row.has_expression_or_predicate,
            name: row.name,
            primary: row.is_primary,
            unique: row.is_unique,
          })),
      ),
      name,
      presence: present.has(name) ? ("PRESENT" as const) : ("ABSENT" as const),
    }))

    const commercialOrder = present.has("CommercialOrder")
      ? await client
          .query<
            Array<{
              cancelled_count: number
              completed_count: number
              confirmed_count: number
              draft_count: number
              fulfilling_count: number
              out_for_delivery_count: number
              pending_count: number
              ready_for_pickup_count: number
              refunded_count: number
              total_count: number
            }>
          >(
            `SELECT COUNT(*)::int AS total_count,
              COUNT(*) FILTER (WHERE status::text = 'DRAFT')::int AS draft_count,
              COUNT(*) FILTER (WHERE status::text = 'PENDING')::int AS pending_count,
              COUNT(*) FILTER (WHERE status::text = 'CONFIRMED')::int AS confirmed_count,
              COUNT(*) FILTER (WHERE status::text = 'FULFILLING')::int AS fulfilling_count,
              COUNT(*) FILTER (WHERE status::text = 'READY_FOR_PICKUP')::int AS ready_for_pickup_count,
              COUNT(*) FILTER (WHERE status::text = 'OUT_FOR_DELIVERY')::int AS out_for_delivery_count,
              COUNT(*) FILTER (WHERE status::text = 'COMPLETED')::int AS completed_count,
              COUNT(*) FILTER (WHERE status::text = 'CANCELLED')::int AS cancelled_count,
              COUNT(*) FILTER (WHERE status::text = 'REFUNDED')::int AS refunded_count
             FROM "CommercialOrder"`,
          )
          .then((result) => ({
            availability: "AVAILABLE" as const,
            completedCount: Number(result[0]?.completed_count ?? 0),
            statusCounts: {
              CANCELLED: Number(result[0]?.cancelled_count ?? 0),
              COMPLETED: Number(result[0]?.completed_count ?? 0),
              CONFIRMED: Number(result[0]?.confirmed_count ?? 0),
              DRAFT: Number(result[0]?.draft_count ?? 0),
              FULFILLING: Number(result[0]?.fulfilling_count ?? 0),
              OUT_FOR_DELIVERY: Number(result[0]?.out_for_delivery_count ?? 0),
              PENDING: Number(result[0]?.pending_count ?? 0),
              READY_FOR_PICKUP: Number(result[0]?.ready_for_pickup_count ?? 0),
              REFUNDED: Number(result[0]?.refunded_count ?? 0),
            },
            totalCount: Number(result[0]?.total_count ?? 0),
          }))
      : { availability: "UNAVAILABLE" as const }

    const commercialOrderGraph = [
      "CommercialOrder",
      "CommercialOrderLine",
      "CommercialOrderPayment",
    ].every((name) => present.has(name))
      ? await client
          .query<
            Array<{
              line_count: number
              order_count: number
              payment_count: number
            }>
          >(
            `SELECT
              (SELECT COUNT(*)::int FROM "CommercialOrder") AS order_count,
              (SELECT COUNT(*)::int FROM "CommercialOrderLine") AS line_count,
              (SELECT COUNT(*)::int FROM "CommercialOrderPayment") AS payment_count`,
          )
          .then((result) => ({
            availability: "AVAILABLE" as const,
            lineCount: Number(result[0]?.line_count ?? 0),
            orderCount: Number(result[0]?.order_count ?? 0),
            paymentCount: Number(result[0]?.payment_count ?? 0),
          }))
      : { availability: "UNAVAILABLE" as const }

    const serviceQuoteGraph = [
      "ServiceQuote",
      "ServiceQuoteLine",
      "ServiceQuoteVersion",
    ].every((name) => present.has(name))
      ? await client
          .query<
            Array<{
              line_count: number
              quote_count: number
              version_count: number
            }>
          >(
            `SELECT
              (SELECT COUNT(*)::int FROM "ServiceQuote") AS quote_count,
              (SELECT COUNT(*)::int FROM "ServiceQuoteVersion") AS version_count,
              (SELECT COUNT(*)::int FROM "ServiceQuoteLine") AS line_count`,
          )
          .then((result) => ({
            availability: "AVAILABLE" as const,
            lineCount: Number(result[0]?.line_count ?? 0),
            quoteCount: Number(result[0]?.quote_count ?? 0),
            versionCount: Number(result[0]?.version_count ?? 0),
          }))
      : { availability: "UNAVAILABLE" as const }

    const commerceQuoteRelations = [
      "CommerceQuote",
      "CommerceQuoteLine",
      "CommerceQuoteOption",
      "CommerceQuoteOptionSelection",
      "CommerceQuoteReplayAccessToken",
      "CommerceQuoteVersion",
    ]
    const commerceQuoteGraph = commerceQuoteRelations.every((name) =>
      present.has(name),
    )
      ? await client
          .query<
            Array<{
              line_count: number
              option_count: number
              quote_count: number
              replay_count: number
              selection_count: number
              version_count: number
            }>
          >(
            `SELECT
              (SELECT COUNT(*)::int FROM "CommerceQuote") AS quote_count,
              (SELECT COUNT(*)::int FROM "CommerceQuoteVersion") AS version_count,
              (SELECT COUNT(*)::int FROM "CommerceQuoteOption") AS option_count,
              (SELECT COUNT(*)::int FROM "CommerceQuoteOptionSelection") AS selection_count,
              (SELECT COUNT(*)::int FROM "CommerceQuoteReplayAccessToken") AS replay_count,
              (SELECT COUNT(*)::int FROM "CommerceQuoteLine") AS line_count`,
          )
          .then((result) => ({
            availability: "AVAILABLE" as const,
            lineCount: Number(result[0]?.line_count ?? 0),
            optionCount: Number(result[0]?.option_count ?? 0),
            quoteCount: Number(result[0]?.quote_count ?? 0),
            replayAccessTokenCount: Number(result[0]?.replay_count ?? 0),
            selectionCount: Number(result[0]?.selection_count ?? 0),
            versionCount: Number(result[0]?.version_count ?? 0),
          }))
      : { availability: "UNAVAILABLE" as const }

    const result = {
      criticalCensus: {
        commerceQuoteGraph,
        commercialOrder,
        commercialOrderGraph,
        serviceQuoteGraph,
      },
      migrations: {
        expected: {
          finishedCount: expectedRows.filter((row) => row.state === "FINISHED")
            .length,
          pendingCount: expectedRows.filter((row) => row.state !== "FINISHED")
            .length,
          totalCount: expectedRows.length,
        },
        rows: expectedRows,
        unknown: {
          finishedCount: unknownLedgerRows.filter(
            (row) => migrationState(row) === "FINISHED",
          ).length,
          pendingCount: unknownLedgerRows.filter(
            (row) => migrationState(row) !== "FINISHED",
          ).length,
          totalCount: unknownLedgerRows.length,
        },
      },
      observedOnly: true as const,
      schema: { tables: schemaTables },
      transaction: {
        leastPrivilegeVerified: true as const,
        readOnlyVerified: true as const,
        rolledBack: true as const,
      },
      truncation: {
        migrationLedger: false as const,
        schemaMetadata: false as const,
      },
    }

    await client.execute("ROLLBACK")
    began = false
    rolledBack = true
    return result
  } catch (error) {
    if (began && !rolledBack) {
      await client.execute("ROLLBACK").catch(() => undefined)
    }
    throw error
  }
}
