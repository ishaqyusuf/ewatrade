import { expect, test } from "bun:test"
const plugin = require("./with-app-update.cjs")
const permission = "android.permission.REQUEST_INSTALL_PACKAGES"
test.each(["com.ewatrade.preview", "com.ewatrade.app", "com.ewatrade.dev"])(
  "installer permission is preview-only: %s",
  async (applicationId) => {
    const config = plugin({
      name: "test",
      slug: "test",
      android: { package: applicationId },
    })
    const result = await config.mods.android.manifest({
      ...config,
      modResults: {
        manifest: {
          "uses-permission": [
            { $: { "android:name": permission } },
            { $: { "android:name": "android.permission.INTERNET" } },
          ],
        },
      },
      modRequest: { platform: "android", modName: "manifest" },
    })
    const names = result.modResults.manifest["uses-permission"].map(
      (item: any) => item.$["android:name"],
    )
    expect(names.filter((name: string) => name === permission)).toHaveLength(
      applicationId === "com.ewatrade.preview" ? 1 : 0,
    )
    expect(names).toContain("android.permission.INTERNET")
  },
)
