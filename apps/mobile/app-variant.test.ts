import { expect, test } from "bun:test"
const { resolveAppVariant } = require("./app-variant.cjs")
const {
  filterAndroidSchemes,
  filterIosSchemes,
} = require("./plugins/with-variant-link-schemes.cjs")
test("the root local/preview profile serves the matching app configuration", () => {
  for (const [profile, expected] of [
    ["local", "development"],
    ["dev", "development"],
    ["preview", "preview"],
    ["prod", "production"],
  ]) {
    expect(resolveAppVariant({ DEV_PROFILE: profile })).toBe(expected)
  }
  expect(resolveAppVariant({ EAS_BUILD_PROFILE: "development" })).toBe(
    "development",
  )
  expect(
    resolveAppVariant({ APP_VARIANT: "preview", DEV_PROFILE: "local" }),
  ).toBe("preview")
  expect(resolveAppVariant({})).toBe("production")
})
test("incremental native prebuild removes other app variants' schemes only", () => {
  for (const selected of ["ewatrade", "ewatrade-preview", "ewatrade-dev"]) {
    const schemes = [
      "ewatrade",
      "ewatrade-preview",
      "ewatrade-dev",
      "exp+ewatrade",
      "google-oauth",
    ]
    const data = schemes.map((scheme) => ({ $: { "android:scheme": scheme } }))
    const manifest = {
      application: [
        {
          activity: [
            {
              "intent-filter": [
                { data },
                {
                  data: [
                    {
                      $: {
                        "android:scheme": "https",
                        "android:host": "example.test",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const result = filterAndroidSchemes(manifest, selected)
    expect(
      result.application[0].activity[0]["intent-filter"][0].data.map(
        (item) => item.$["android:scheme"],
      ),
    ).toEqual([selected, "exp+ewatrade", "google-oauth"])
    expect(
      result.application[0].activity[0]["intent-filter"][1].data[0].$[
        "android:host"
      ],
    ).toBe("example.test")
    const plist = filterIosSchemes(
      { CFBundleURLTypes: [{ CFBundleURLSchemes: schemes }] },
      selected,
    )
    expect(plist.CFBundleURLTypes[0].CFBundleURLSchemes).toEqual([
      selected,
      "exp+ewatrade",
      "google-oauth",
    ])
  }
})
