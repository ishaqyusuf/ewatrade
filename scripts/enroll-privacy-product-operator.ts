import { writeSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { parseArgs, parseEnv } from "node:util"
import {
  assertPrivacyOperatorApplyApproval,
  assertPrivacyOperatorTarget,
  privacyOperatorBinding,
  readPrivacyProductOperatorPlan,
} from "../packages/db/src/privacy-operator-plan"
import {
  createPrivacyOperatorEnrollmentPool,
  enrollPrivacyProductOperator,
  previewPrivacyProductOperator,
  readPrivacyOperatorOfficeProof,
} from "../packages/db/src/queries/privacy-operator-enrollment"
import {
  applyDatabaseProfile,
  loadProductionDatabaseUrl,
} from "./database-profile.mjs"
import { loadRootEnvironment } from "./environment-profile.mjs"

const root = resolve(import.meta.dir, "..")
const officeEnv = "/Users/M1PRO/Documents/code/oversight/.env.local"
let product: ReturnType<typeof createPrivacyOperatorEnrollmentPool> | undefined
let office: ReturnType<typeof createPrivacyOperatorEnrollmentPool> | undefined
try {
  const { values } = parseArgs({
    options: {
      plan: { type: "string" },
      "environment-root": { type: "string" },
      apply: { type: "boolean", default: false },
    },
    strict: true,
  })
  if (!values.plan) throw Error("Provide the exact reviewed --plan")
  const { plan, sha256 } = readPrivacyProductOperatorPlan(
    await readFile(values.plan, "utf8"),
  )
  // Refuse missing approval before any connection or privilege inventory read.
  if (values.apply) assertPrivacyOperatorApplyApproval(sha256, process.env)
  const environmentRoot = resolve(values["environment-root"] ?? root)
  const loaded = loadRootEnvironment(environmentRoot, {
    DEV_PROFILE: "production",
  })
  if (!loaded.profileExists) throw Error("Production profile required")
  const env = applyDatabaseProfile(
    loaded.env,
    loadProductionDatabaseUrl(environmentRoot),
  )
  const officeValues = parseEnv(await readFile(officeEnv, "utf8"))
  product = createPrivacyOperatorEnrollmentPool(
    assertPrivacyOperatorTarget(
      env.EWATRADE_DATABASE_URL ?? "",
      plan.databaseHost,
      plan.databaseName,
    ),
  )
  office = createPrivacyOperatorEnrollmentPool(
    assertPrivacyOperatorTarget(
      officeValues.DATABASE_URL ?? "",
      plan.officeDatabaseHost,
      plan.officeDatabaseName,
    ),
  )
  const proof = await readPrivacyOperatorOfficeProof(office, plan)
  const outcome = values.apply
    ? await enrollPrivacyProductOperator(product, plan, proof, sha256)
    : await previewPrivacyProductOperator(product, plan, proof)
  writeSync(
    1,
    `${JSON.stringify({
      mode: values.apply ? "applied" : "read-only-preview",
      planSha256: sha256,
      ...outcome,
      broadPlatformPrivilege: true,
      binding: privacyOperatorBinding(plan),
      configurationChanged: false,
    })}\n`,
  )
} catch {
  writeSync(
    2,
    "Product enrollment refused or unavailable. Inspect exact target, plan approval, current office authority and existing identity; no credentials printed. Do not blindly replay an apply after an uncertain result.\n",
  )
  process.exitCode = 1
} finally {
  await Promise.allSettled([product?.end(), office?.end()])
}
