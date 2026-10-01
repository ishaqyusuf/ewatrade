const { describe, expect, test } = require("bun:test")
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs")
const { tmpdir } = require("node:os")
const { join } = require("node:path")
const {
  createProductionDesignReferenceAliases,
  createProductionQaAliases,
  isInternalQaBuild,
  resolveDesignReferenceAlias,
  resolveProductionInternalDesignAssetAlias,
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

  test("uses an included reference for design-only images excluded from EAS", () => {
    const aliases = createProductionDesignReferenceAliases(__dirname)
    const designData = readFileSync(
      join(
        __dirname,
        "src/components/mobile/design-system/designs/design-01/design-01.data.ts",
      ),
      "utf8",
    )
    const sourceImports = [
      ...designData.matchAll(/require\("(@design\/[^\"]+)"\)/g),
    ].map((match) => match[1])
    expect([...aliases.keys()].sort()).toEqual(sourceImports.sort())
    expect([...aliases.keys()].sort()).toEqual([
      "@design/reference-commerce-home-customer-orders.png",
      "@design/reference-customer-orders-insights.png",
      "@design/reference-customer-wishlist-reviews-loyalty.png",
      "@design/reference-customers-profile-orders.png",
      "@design/reference-products-create-media.png",
    ])
    expect(new Set(aliases.values()).size).toBe(1)
    expect([...aliases.values()][0]).toBe(
      join(__dirname, "assets/icons/splash-logo.png"),
    )
  })

  test("keeps internal design art out of Production while retaining local QA art", () => {
    const placeholder = join(__dirname, "assets/icons/splash-logo.png")
    for (const moduleName of [
      "@assets/images/design-system/reference-home-shell.jpg",
      "@assets/images/design-system/reference-admin-more.png",
      "@assets/images/e-shop/banner.jpg",
      "@assets/images/e-shop/hair/olaplex-1.jpeg",
    ]) {
      expect(
        resolveProductionInternalDesignAssetAlias(moduleName, __dirname, false),
      ).toBe(placeholder)
      expect(
        resolveProductionInternalDesignAssetAlias(moduleName, __dirname, true),
      ).toBeNull()
    }
    expect(
      resolveProductionInternalDesignAssetAlias(
        "@assets/icons/splash-logo.png",
        __dirname,
        false,
      ),
    ).toBeNull()
  })

  test("keeps available QA reference art and substitutes absent EAS archive art", () => {
    const designRoot = mkdtempSync(join(tmpdir(), "ewa-design-reference-"))
    const aliases = createProductionDesignReferenceAliases(__dirname)
    const moduleName = "@design/reference-commerce-home-customer-orders.png"
    const bundledReference = aliases.get(moduleName)
    try {
      expect(
        resolveDesignReferenceAlias(moduleName, designRoot, aliases, true),
      ).toBe(bundledReference)
      writeFileSync(
        join(designRoot, moduleName.slice("@design/".length)),
        "art",
      )
      expect(
        resolveDesignReferenceAlias(moduleName, designRoot, aliases, true),
      ).toBeNull()
      expect(
        resolveDesignReferenceAlias(moduleName, designRoot, aliases, false),
      ).toBe(bundledReference)
    } finally {
      rmSync(designRoot, { recursive: true, force: true })
    }
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
    const login = readFileSync(
      join(__dirname, "src/components/mobile/login/login-screen.tsx"),
      "utf8",
    )

    expect(sheet).toContain("enableDismissOnClose")
    expect(sheet).toContain("enablePanDownToClose")
    expect(sheet).toContain("Continue without QA")
    expect(sheet).not.toContain('pressBehavior="none"')
    expect(chooser).toContain('accessibilityLabel="Set up QA"')
    expect(chooser).toContain("qa.openAuthorizationSheet")
    expect(login).toContain("<QaAccountChooser />")
  })
})
