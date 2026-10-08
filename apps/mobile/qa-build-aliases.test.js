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

  test("excludes public bootstrap while retaining authenticated draft controls and recipes", () => {
    const aliases = createProductionQaAliases(__dirname)
    expect([...aliases.keys()].sort()).toEqual([
      "@/components/mobile/floating-qa-button",
      "@/components/mobile/qa-account-chooser",
      "@/components/mobile/qa-authorization-sheet",
      "@/hooks/use-qa-accelerator",
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
    const floatingQa = readFileSync(
      join(__dirname, "src/components/mobile/floating-qa-button.tsx"),
      "utf8",
    )

    // The QA domain composer opens only when the QA button asks for it and
    // closes with the keyboard, so ordinary login is never blocked by QA.
    expect(sheet).toContain("<KeyboardInlineComposer")
    expect(sheet).toContain("qa.authorizationSheetRequest")
    expect(sheet).toContain('"keyboardDidHide"')
    expect(chooser).toContain('accessibilityLabel="Set up QA"')
    expect(chooser).toContain("qa.openAuthorizationSheet")
    expect(floatingQa).toContain("<QaAccountChooser />")
    expect(floatingQa).toContain('pathname !== "/login"')
  })
})
