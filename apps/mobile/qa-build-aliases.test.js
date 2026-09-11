const { describe, expect, test } = require("bun:test")
const { readFileSync } = require("node:fs")
const { join } = require("node:path")
const {
  createProductionQaAliases,
  isInternalQaBuild,
} = require("./qa-build-aliases.cjs")

describe("mobile QA build aliases", () => {
  test.each(["local", "dev", "development", "preview"])(
    "keeps real QA modules in %s builds",
    (APP_VARIANT) => {
      expect(isInternalQaBuild({ APP_VARIANT })).toBe(true)
    },
  )

  test.each(["production", "staging", "unknown"])(
    "uses production no-op modules in %s builds",
    (APP_VARIANT) => {
      expect(isInternalQaBuild({ APP_VARIANT })).toBe(false)
    },
  )

  test("aliases every QA entry point to an internal production no-op", () => {
    const aliases = createProductionQaAliases(__dirname)
    expect([...aliases.keys()].sort()).toEqual([
      "@/components/mobile/qa-account-chooser",
      "@/components/mobile/qa-authorization-sheet",
      "@/components/mobile/qa-quick-fill-button",
      "@/hooks/use-qa-accelerator",
      "@/internal-tooling/fixture-recipes",
    ])
    expect(
      [...aliases.values()].every((target) =>
        /\.production\.tsx?$/.test(target),
      ),
    ).toBe(true)
  })

  test("keeps QA context above the bottom-sheet portal host", () => {
    const layout = readFileSync(join(__dirname, "src/app/_layout.tsx"), "utf8")
    const qaProviderOpen = layout.indexOf("<QaAcceleratorProvider>")
    const bottomSheetProviderOpen = layout.indexOf("<BottomSheetModalProvider>")
    const bottomSheetProviderClose = layout.indexOf(
      "</BottomSheetModalProvider>",
    )
    const qaProviderClose = layout.indexOf("</QaAcceleratorProvider>")

    expect(qaProviderOpen).toBeGreaterThan(-1)
    expect(bottomSheetProviderOpen).toBeGreaterThan(qaProviderOpen)
    expect(bottomSheetProviderClose).toBeGreaterThan(bottomSheetProviderOpen)
    expect(qaProviderClose).toBeGreaterThan(bottomSheetProviderClose)
  })

  test("keeps QA setup optional and reachable from ordinary login", () => {
    const sheet = readFileSync(
      join(__dirname, "src/components/mobile/qa-authorization-sheet.tsx"),
      "utf8",
    )
    const chooser = readFileSync(
      join(__dirname, "src/components/mobile/qa-account-chooser.tsx"),
      "utf8",
    )
    const login = readFileSync(join(__dirname, "src/app/login.tsx"), "utf8")

    expect(sheet).toContain("enableDismissOnClose")
    expect(sheet).toContain("enablePanDownToClose")
    expect(sheet).toContain("Continue without QA")
    expect(sheet).not.toContain('pressBehavior="none"')
    expect(chooser).toContain('accessibilityLabel="Set up QA"')
    expect(chooser).toContain("qa.openAuthorizationSheet")
    expect(login).toContain("<QaAccountChooser />")
  })
})
