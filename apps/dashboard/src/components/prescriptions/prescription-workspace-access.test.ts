import { describe, expect, test } from "bun:test"
import { prescriptionWorkspaceAccessState } from "./prescription-workspace-access"

describe("prescription workspace access", () => {
  test("routes setup managers without a clinical role into onboarding", () => {
    expect(
      prescriptionWorkspaceAccessState({
        canManageSetup: true,
        hasError: false,
        isDenied: true,
        isLoading: false,
      }),
    ).toBe("setup_required")
  })

  test("does not expose setup or queue content to other unauthorized staff", () => {
    expect(
      prescriptionWorkspaceAccessState({
        canManageSetup: false,
        hasError: false,
        isDenied: true,
        isLoading: false,
      }),
    ).toBe("forbidden")
  })

  test("keeps loading and ready states explicit", () => {
    expect(
      prescriptionWorkspaceAccessState({
        canManageSetup: true,
        hasError: false,
        isDenied: false,
        isLoading: true,
      }),
    ).toBe("loading")
    expect(
      prescriptionWorkspaceAccessState({
        canManageSetup: false,
        hasError: false,
        isDenied: false,
        isLoading: false,
      }),
    ).toBe("ready")
  })
})
