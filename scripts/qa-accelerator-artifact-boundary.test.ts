import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { verifyQaAcceleratorArtifacts } from "./check-qa-accelerator-artifact.mjs"

const temporaryRoots: string[] = []
const expectedRoutes = [
  "/api/qa-access/capability/route",
  "/api/qa-access/exchange/route",
  "/api/qa-access/profiles/route",
  "/api/qa-access/revalidate/route",
  "/api/qa-access/revoke/route",
  "/api/qa-access/select/route",
]

afterEach(() => {
  for (const path of temporaryRoots.splice(0)) {
    rmSync(path, { force: true, recursive: true })
  }
})

function createArtifacts(input: {
  dashboard: string
  marketing: string
  mobile: string
  routes: string[]
}) {
  const root = mkdtempSync(join(tmpdir(), "ewatrade-qa-artifacts-"))
  temporaryRoots.push(root)
  const dashboard = join(root, "dashboard")
  const marketing = join(root, "marketing")
  const mobile = join(root, "mobile")
  mkdirSync(join(dashboard, "static"), { recursive: true })
  mkdirSync(join(marketing, "server"), { recursive: true })
  mkdirSync(join(marketing, "static"), { recursive: true })
  mkdirSync(mobile, { recursive: true })
  writeFileSync(join(dashboard, "static", "entry.js"), input.dashboard)
  writeFileSync(join(marketing, "static", "entry.js"), input.marketing)
  writeFileSync(
    join(marketing, "server", "app-paths-manifest.json"),
    JSON.stringify(
      Object.fromEntries(input.routes.map((route) => [route, route])),
    ),
  )
  writeFileSync(join(mobile, "entry.hbc"), input.mobile)
  return {
    dashboardArtifactPath: dashboard,
    marketingArtifactPath: marketing,
    mobileArtifactPath: mobile,
  }
}

describe("QA accelerator artifact boundary", () => {
  test("accepts production artifacts with no QA controls or routes", () => {
    const artifacts = createArtifacts({
      dashboard: "ordinary dashboard",
      marketing: "ordinary website",
      mobile: "ordinary mobile app",
      routes: ["/api/early-access/route"],
    })
    expect(
      verifyQaAcceleratorArtifacts({ ...artifacts, mode: "production" }),
    ).toMatchObject({ marketingQaRouteCount: 0, mode: "production" })
  })

  test("rejects a production bundle containing a QA marker", () => {
    const artifacts = createArtifacts({
      dashboard: "ordinary dashboard",
      marketing: "Quick Fill",
      mobile: "ordinary mobile app",
      routes: [],
    })
    expect(() =>
      verifyQaAcceleratorArtifacts({ ...artifacts, mode: "production" }),
    ).toThrow("marketing production artifact exposes QA markers")
  })

  test("accepts preview artifacts with controls and six website routes", () => {
    const artifacts = createArtifacts({
      dashboard: "QA ONLY Quick Fill qa+",
      marketing: "QA ONLY Quick Fill qa+ QA Domain",
      mobile: "Quick Fill qa+ createQaFixture QA Domain",
      routes: expectedRoutes,
    })
    expect(
      verifyQaAcceleratorArtifacts({ ...artifacts, mode: "preview" }),
    ).toMatchObject({ marketingQaRouteCount: 6, mode: "preview" })
  })

  test("rejects preview artifacts with an incomplete route set", () => {
    const artifacts = createArtifacts({
      dashboard: "QA ONLY Quick Fill qa+",
      marketing: "QA ONLY Quick Fill qa+ QA Domain",
      mobile: "Quick Fill qa+ createQaFixture QA Domain",
      routes: ["/api/qa-access/capability/route"],
    })
    expect(() =>
      verifyQaAcceleratorArtifacts({ ...artifacts, mode: "preview" }),
    ).toThrow("has the wrong QA routes")
  })
})
