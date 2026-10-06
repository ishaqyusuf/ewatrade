import { expect, test } from "bun:test"
import {
  previewBuildPublication,
  runPreviewBuildAndPublish,
} from "./release-app-update"
import { MOBILE_PROJECT } from "./release-mobile-target"
const sha = "a".repeat(40)
const build = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "FINISHED",
  platform: "ANDROID",
  buildProfile: "preview",
  distribution: "INTERNAL",
  channel: "preview",
  project: {
    id: MOBILE_PROJECT.projectId,
    ownerAccount: { name: MOBILE_PROJECT.owner },
  },
  gitCommitHash: sha,
  appBuildVersion: "12",
  appVersion: "1.2.0",
  artifacts: { buildUrl: "https://expo.dev/artifacts/eas/example.apk" },
}
test("release publishes the exact completed preview build only after provider recheck", async () => {
  const commands: string[][] = []
  const publications: string[][] = []
  const code = await runPreviewBuildAndPublish({
    command: ["eas", "build", "--platform", "android"],
    root: ".",
    expectedCommit: sha,
    runJson: async (cmd) => {
      commands.push(cmd)
      return {
        code: 0,
        output: JSON.stringify(cmd.includes("build:view") ? build : [build]),
      }
    },
    publish: async (args) => {
      publications.push(args)
    },
  })
  expect(code).toBe(0)
  expect(commands[0]).toContain("--wait")
  expect(commands[0]).toContain("--json")
  expect(commands[1]).toEqual(["eas", "build:view", build.id, "--json"])
  expect(publications[0]).toContain("12")
  expect(publications[0]).toContain(build.artifacts.buildUrl)
})
test.each([
  { status: "IN_QUEUE" },
  { platform: "IOS" },
  { channel: "production" },
  { distribution: "STORE" },
  { gitCommitHash: "b".repeat(40) },
  { project: { id: "wrong" } },
  { appBuildVersion: "bad" },
])("rejects mismatched provider record %j", (override) =>
  expect(() =>
    previewBuildPublication({ ...build, ...override }, sha),
  ).toThrow(),
)
test("failed builds never publish and publication failure gives a no-rebuild recovery command", async () => {
  let calls = 0
  expect(
    await runPreviewBuildAndPublish({
      command: ["eas", "build"],
      root: ".",
      expectedCommit: sha,
      runJson: async () => ({ code: 1, output: "" }),
      publish: async () => {
        calls++
      },
    }),
  ).toBe(1)
  expect(calls).toBe(0)
  await expect(
    runPreviewBuildAndPublish({
      command: ["eas", "build"],
      root: ".",
      expectedCommit: sha,
      runJson: async () => ({ code: 0, output: JSON.stringify(build) }),
      publish: async () => {
        throw new Error("offline")
      },
    }),
  ).rejects.toThrow("bun app:update publish --backend preview")
})

test("the recovery command resolves to the existing publisher CLI", async () => {
  const { scripts } = await Bun.file(
    new URL("../package.json", import.meta.url),
  ).json()
  expect(scripts["app:update"]).toBe(
    "bun --env-file=/dev/null ../local-infra-kit/bin/app-update.ts",
  )
})
