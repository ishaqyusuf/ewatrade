import { expect, test } from "bun:test"
import { isPrescriptionTrpcRoute } from "./trpc-launch-route"

test("identifies pharmacy tRPC routes, including batches and encoded names", () => {
  expect(
    isPrescriptionTrpcRoute("/api/trpc/prescriptionAccess.uploadMedia"),
  ).toBe(true)
  expect(isPrescriptionTrpcRoute("/api/trpc/prescriptions.submitStaff")).toBe(
    true,
  )
  expect(
    isPrescriptionTrpcRoute(
      "/api/trpc/auth.legalPublication,prescriptionAccess.submit",
    ),
  ).toBe(true)
  expect(
    isPrescriptionTrpcRoute("/api/trpc/prescriptionAccess%2EuploadMedia"),
  ).toBe(true)
  expect(isPrescriptionTrpcRoute("/api/trpc/auth.legalPublication")).toBe(false)
  expect(isPrescriptionTrpcRoute("/api/trpc/prescriptionsOther.status")).toBe(
    false,
  )
  expect(
    isPrescriptionTrpcRoute("/api/auth/prescriptionAccess.uploadMedia"),
  ).toBe(false)
  expect(isPrescriptionTrpcRoute("/api/trpc/%ZZ")).toBe(false)
})

test("closed pharmacy route rejects before tRPC parses an invalid upload body", async () => {
  const previousAppEnv = process.env.APP_ENV
  const previousNodeEnv = process.env.NODE_ENV
  const previousDevProfile = process.env.DEV_PROFILE
  const previousApproval = process.env.PRESCRIPTION_COMMERCE_LAUNCH_APPROVED
  process.env.APP_ENV = "production"
  process.env.PRESCRIPTION_COMMERCE_LAUNCH_APPROVED = "false"
  try {
    const { app } = await import("../index")
    for (const path of [
      "/api/trpc/prescriptionAccess.uploadMedia",
      "/api/trpc/auth.legalPublication,prescriptionAccess.uploadMedia?batch=1",
    ]) {
      const response = await app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not JSON",
      })
      expect(response.status).toBe(404)
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(await response.json()).toEqual({
        error: "Pharmacy Commerce is unavailable.",
      })
    }
    process.env.APP_ENV = ""
    process.env.NODE_ENV = ""
    const unprofiled = await app.request(
      "/api/trpc/prescriptionAccess.uploadMedia",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not JSON",
      },
    )
    expect(unprofiled.status).toBe(404)
    process.env.APP_ENV = "preview"
    process.env.NODE_ENV = "development"
    process.env.PRESCRIPTION_COMMERCE_LAUNCH_APPROVED = "true"
    const preview = await app.request(
      "/api/trpc/prescriptionAccess.uploadMedia",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not JSON",
      },
    )
    expect(preview.status).toBe(404)
    expect(preview.headers.get("cache-control")).toBe("no-store")
    process.env.APP_ENV = "production"
    process.env.DEV_PROFILE = "preview"
    process.env.NODE_ENV = "production"
    const contradictory = await app.request(
      "/api/trpc/prescriptionAccess.uploadMedia",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not JSON",
      },
    )
    expect(contradictory.status).toBe(404)
    expect(contradictory.headers.get("cache-control")).toBe("no-store")
  } finally {
    process.env.APP_ENV = previousAppEnv ?? ""
    process.env.DEV_PROFILE = previousDevProfile ?? ""
    process.env.NODE_ENV = previousNodeEnv ?? ""
    process.env.PRESCRIPTION_COMMERCE_LAUNCH_APPROVED = previousApproval ?? ""
  }
})
