import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import {
  buildCapabilityCoverage,
  renderCoverageMarkdown,
} from "@ewatrade/assistant/capabilities/coverage"
import {
  coverageDocumentPath,
  listRouterProcedures,
} from "./capability-coverage"

test("every merchant procedure is a capability or deliberately classified", async () => {
  const procedures = await listRouterProcedures()
  const { rows, errors } = buildCapabilityCoverage(procedures)
  expect(errors).toEqual([])
  // Audience detection must keep seeing the tenant-scoped surface.
  expect(procedures.find((row) => row.path === "orders.create")?.merchant).toBe(
    true,
  )
  expect(
    procedures.find((row) => row.path === "auth.verifyMobileOwnerOtp"),
  ).toMatchObject({ merchant: false })
  expect(await readFile(coverageDocumentPath, "utf8")).toBe(
    renderCoverageMarkdown(rows),
  )
})
