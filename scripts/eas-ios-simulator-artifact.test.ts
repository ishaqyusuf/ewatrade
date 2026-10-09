import { expect, test } from "bun:test"
import { isReviewedIosPreviewSimulatorArtifact } from "./eas-ios-simulator-artifact"
const expected = { id: "build-1", commit: "a".repeat(40) }
const valid = {
  id: expected.id,
  status: "FINISHED",
  platform: "IOS",
  buildProfile: "preview-simulator",
  channel: "preview",
  distribution: "INTERNAL",
  gitCommitHash: expected.commit,
  isForIosSimulator: true,
  project: {
    id: "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b",
    ownerAccount: { name: "cipron-startups" },
  },
}
test("only the exact reviewed EwaTrade Preview Simulator artifact is accepted", () => {
  expect(isReviewedIosPreviewSimulatorArtifact(valid, expected)).toBe(true)
})
test.each([
  { id: "other" },
  { status: "IN_PROGRESS" },
  { platform: "ANDROID" },
  { buildProfile: "production" },
  { channel: "production" },
  { distribution: "STORE" },
  { gitCommitHash: null },
  { gitCommitHash: "b".repeat(40) },
  { isForIosSimulator: false },
  { project: { id: "other", ownerAccount: { name: "cipron-startups" } } },
  { project: { id: valid.project.id, ownerAccount: { name: "other" } } },
])("refuses an artifact with mismatched metadata %j", (override) => {
  expect(
    isReviewedIosPreviewSimulatorArtifact({ ...valid, ...override }, expected),
  ).toBe(false)
})
test("a short or missing source revision cannot authorize a download", () => {
  expect(
    isReviewedIosPreviewSimulatorArtifact(valid, {
      ...expected,
      commit: "a".repeat(12),
    }),
  ).toBe(false)
})
