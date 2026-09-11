import { existsSync, readFileSync, readdirSync } from "node:fs"
import { extname, join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const SOURCE_DIR = join(MOBILE_DIR, "src")

const contracts = [
  {
    file: "lib/mobile-accessibility-layout.ts",
    markers: [
      "LARGE_TEXT_FONT_SCALE = 1.5",
      "LARGE_TEXT_EFFECTIVE_WIDTH = 280",
      "DISPLAY_TEXT_FONT_SCALE_CAP = 1.6",
      "width / safeFontScale",
    ],
  },
  {
    file: "hooks/use-large-text-layout.ts",
    markers: [
      "useWindowDimensions",
      "shouldUseLargeTextLayout({ fontScale, width })",
    ],
  },
  {
    file: "components/mobile/bottom-tab-item.tsx",
    markers: [
      "useLargeTextLayout",
      "DISPLAY_TEXT_FONT_SCALE_CAP",
      "adjustsFontSizeToFit={!largeTextLayout}",
      "numberOfLines={largeTextLayout ? 2 : 1}",
    ],
  },
  {
    file: "components/mobile/qa-authorization-sheet.tsx",
    markers: [
      "useLargeTextLayout",
      "largeTextLayout ? (",
      '<View className="flex-row items-center justify-between gap-3">',
      "<QaMark />",
      "<ModeBadge label={modeLabel} />",
    ],
  },
  {
    file: "app/login.tsx",
    markers: [
      "useLargeTextLayout",
      'largeTextLayout ? "justify-start gap-5" : "justify-start gap-7"',
    ],
  },
  {
    file: "app/sign-up.tsx",
    markers: [
      "useLargeTextLayout",
      'largeTextLayout ? "justify-start gap-5" : "justify-start gap-6"',
      'largeTextLayout ? "gap-3" : "flex-row gap-3"',
      '"min-h-14 w-full items-center justify-center rounded-2xl',
      "SignUpMarketStall",
      "key={step}",
    ],
  },
  {
    file: "app/no-access.tsx",
    markers: [
      'title="No workspace available yet"',
      "Create your business account",
      "Check again",
    ],
  },
  {
    file: "app/verify-email.tsx",
    markers: [
      "useLargeTextLayout",
      "largeTextLayout ? styles.heroLarge : styles.hero",
      "numberOfLines={largeTextLayout ? 2 : 1}",
      "largeTextLayout ? -58 : -48",
    ],
  },
  {
    file: "app/onboarding.tsx",
    markers: [
      "useLargeTextLayout",
      'largeTextLayout ? "justify-start gap-6" : "justify-between gap-8"',
      "<HeroMark compact={largeTextLayout}",
      "compactHeroWrap",
      'largeTextLayout\n                  ? "text-4xl font-bold leading-tight text-foreground"',
    ],
  },
  {
    file: "components/mobile/otp-input.tsx",
    markers: [
      "useLargeTextLayout",
      "styles.largeTextReferenceCell",
      "height: 64",
      "width: 48",
    ],
  },
  {
    file: "components/mobile/otp-keypad.tsx",
    markers: [
      "useLargeTextLayout",
      "defaultKeyHeightClassName",
      "styles.marketKeyLarge",
      "height: 94",
    ],
  },
  {
    file: "components/mobile/customer-conversations/customer-conversation-composer.tsx",
    markers: [
      "useLargeTextLayout",
      "largeTextLayout ? 72 : 24",
      "contentHeight <= (largeTextLayout ? 80 : 32)",
      "Math.max(currentHeight, 72)",
    ],
  },
  {
    file: "components/mobile/keyboard-inline-composer.tsx",
    markers: [
      "useLargeTextLayout",
      'largeTextLayout ? "gap-2" : "flex-row items-center gap-2"',
      '"min-h-14 min-w-0 flex-row items-center rounded-2xl border border-border bg-card px-4"',
      '"min-h-12 w-full flex-row items-center justify-center gap-2 rounded-full px-5"',
      "largeTextPlaceholder",
      "submitLabel",
    ],
  },
  {
    file: "components/mobile/customer-conversations/customer-shell-header.tsx",
    markers: [
      "useLargeTextLayout",
      "numberOfLines={largeTextLayout ? 2 : 1}",
      'className="gap-2 bg-background px-5 pb-4"',
      "Your conversations with stores",
    ],
  },
  {
    file: "components/mobile/customer-conversations/customer-conversation-detail-qa-screen.tsx",
    markers: [
      "useLargeTextLayout",
      "numberOfLines={largeTextLayout ? 2 : 1}",
      "listRef.current?.scrollToEnd({ animated: false })",
      "onContentSizeChange={() =>",
      "composerHeight + keyboardInset + (largeTextLayout ? 40 : 16)",
    ],
  },
  {
    file: "components/mobile/customer-conversations/customer-conversation-detail-screen.tsx",
    markers: [
      "useLargeTextLayout",
      "composerHeight + keyboardInset + (largeTextLayout ? 40 : 16)",
      "key={detailQaState}",
    ],
  },
  {
    file: "components/mobile/customer-conversations/customer-conversation-list-item.tsx",
    markers: [
      "useLargeTextLayout",
      '"relative min-h-[112px] flex-row items-start',
      "numberOfLines={2}",
    ],
  },
  {
    file: "components/mobile/customer-conversations/customer-conversation-list-empty.tsx",
    markers: [
      "useLargeTextLayout",
      'largeTextLayout\n            ? "flex-1 items-center px-8 pt-14"',
    ],
  },
  {
    file: "components/mobile/dashboard-kit.tsx",
    markers: [
      "useLargeTextLayout",
      "numberOfLines={largeTextLayout ? 2 : 1}",
      'largeTextLayout\n              ? "gap-1"',
      'largeTextLayout\n                ? "min-h-14 flex-row items-center justify-between gap-4 py-2"',
    ],
  },
  {
    file: "components/mobile/commerce/commerce-primitives.tsx",
    markers: [
      "useLargeTextLayout",
      'largeTextLayout ? "w-9" : "w-6"',
      "numberOfLines={largeTextLayout ? 2 : 1}",
      'largeTextLayout\n                  ? "min-h-14 flex-row items-center justify-between gap-4 py-2"',
    ],
  },
  {
    file: "components/mobile/catalog-items-sheet.tsx",
    markers: [
      "useLargeTextLayout",
      'largeTextLayout\n                  ? "min-h-[72px] flex-row items-start',
      'largeTextLayout\n                    ? "mt-1 size-11',
      'largeTextLayout\n                    ? "mt-1 size-sm text-primary"',
    ],
  },
  {
    file: "components/mobile/admin-tabs/admin-more-screen.tsx",
    markers: [
      "useLargeTextLayout",
      'largeTextLayout\n          ? "mb-5 items-start gap-3"',
      "numberOfLines={largeTextLayout ? undefined : 1}",
      'largeTextLayout\n            ? "min-w-0 flex-1 flex-row items-start',
      'className={largeTextLayout ? "mt-1" : undefined}',
    ],
  },
  {
    file: "components/mobile/admin-tabs/admin-create-action-sheet.tsx",
    markers: [
      "useLargeTextLayout",
      "BottomSheetScrollView",
      'largeTextLayout ? ["92%"]',
      'largeTextLayout ? "items-start" : "items-center"',
      'className={largeTextLayout ? "mt-1" : undefined}',
    ],
  },
  {
    file: "components/mobile/simple-catalog-item-screen.tsx",
    markers: [
      "useLargeTextLayout",
      'largeTextLayout ? "gap-3" : "flex-row gap-3"',
      'largeTextLayout ? undefined : "min-w-0 flex-1"',
      '"-mx-2 min-h-16 flex-row items-start gap-3',
      '? "mt-1 h-10 w-10 items-center justify-center rounded-2xl bg-muted"',
      '? "mt-1 size-sm text-muted-foreground"',
      '"-mx-2 min-h-16 flex-row items-start gap-3 border-b border-border bg-accent px-3 py-3"',
      '"-mx-2 min-h-16 flex-row items-start gap-3 border-b border-border px-3 py-3 active:bg-accent/60"',
      'largeTextLayout\n              ? "text-xs leading-5 text-muted-foreground"',
      '"mt-1 h-5 w-5 items-center justify-center rounded-full border-[6px] border-primary"',
      '? "mt-1 h-7 w-12 items-end justify-center rounded-full bg-primary px-1"',
      'largeTextLayout ? "gap-3" : "flex-row items-start justify-between gap-3"',
      'largeTextLayout ? "gap-1" : "min-w-0 flex-1 gap-1"',
      '"min-h-12 w-full flex-row items-center justify-center gap-2 rounded-full bg-muted px-5"',
      'snapPoints={largeTextLayout ? ["96%"] : ["88%"]}',
      'largeTextLayout ? "gap-2" : "flex-row gap-2"',
      '? "min-h-20 w-full justify-center rounded-2xl border border-primary bg-primary/10 px-4 py-3"',
      'largeTextLayout ? "gap-3" : "flex-row gap-3"',
      '? "min-h-20 flex-row items-start gap-3 rounded-2xl border border-primary bg-primary/10 px-3 py-3"',
      '"-mx-2 min-h-16 flex-row items-start gap-3 rounded-2xl px-3 py-3 active:bg-muted"',
      '"-mx-2 min-h-16 flex-row items-start gap-3 rounded-2xl px-3 py-3 active:bg-destructive/10"',
      "largeTextLayout && hasOptions",
      '"min-h-12 w-full flex-row items-center justify-center gap-2 rounded-full bg-muted px-5"',
      "<CatalogEssentialsFields",
    ],
  },
  {
    file: "components/mobile/catalog-setup-helper-picker.tsx",
    markers: [
      "useLargeTextLayout",
      'largeTextLayout\n          ? "min-h-20 flex-row items-start',
      "largeTextLayout && badgeLabel",
      "largeTextLayout && selectedKey === null",
      '? "mt-1 size-sm text-muted-foreground"',
    ],
  },
  {
    file: "components/mobile/catalog-variant-manager.tsx",
    markers: [
      "useLargeTextLayout",
      '"-mx-2 flex-row items-start gap-1 border-b border-border"',
      'kind === "service" && largeTextLayout ? undefined : 2',
      'kind === "product" && largeTextLayout',
      "numberOfLines={largeTextLayout ? undefined : 2}",
      '"mr-1 mt-4 h-11 w-11 items-center justify-center rounded-full bg-transparent active:bg-muted"',
      '"min-h-20 w-full justify-between gap-2 rounded-2xl border-2 border-primary bg-muted px-4 py-3"',
      'snapPoints={largeTextLayout ? ["96%"] : ["62%", "96%"]}',
      'largeTextLayout ? "gap-3" : "flex-row gap-3"',
      "snapToIndex(largeTextLayout ? 0 : 1)",
      '? "min-h-16 gap-3 px-3 py-3"',
      '? "-mx-2 min-h-16 flex-row items-start gap-3 border-y border-border px-3 py-3 pr-20"',
      'largeTextLayout\n                          ? "gap-2"',
      '"min-h-11 w-full flex-row items-center justify-end gap-1"',
      'largeTextLayout && kind === "product" && !editorUnit',
    ],
  },
  {
    file: "components/mobile/auth-header.tsx",
    markers: [
      "useLargeTextLayout",
      "DISPLAY_TEXT_FONT_SCALE_CAP",
      '"flex-row items-center"',
      '"w-full text-left"',
    ],
  },
  {
    file: "components/mobile/form-field.tsx",
    markers: [
      "useLargeTextLayout",
      "largeTextLayout ? 64 : 50",
      "!isSearchVariant && (!isAuthVariant || largeTextLayout)",
      "numberOfLines={isMultiline ? inputProps.numberOfLines : 1}",
      "!isMultiline && largeTextLayout ? { height: 64 } : undefined",
    ],
  },
]

const failures = []

for (const contract of contracts) {
  const path = join(SOURCE_DIR, contract.file)
  if (!existsSync(path)) {
    failures.push(`${contract.file} is missing`)
    continue
  }

  const source = readFileSync(path, "utf8")
  for (const marker of contract.markers) {
    if (!source.includes(marker)) {
      failures.push(`${contract.file} is missing marker: ${marker}`)
    }
  }
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : []
  })
}

for (const path of sourceFiles(SOURCE_DIR)) {
  const source = readFileSync(path, "utf8")
  if (/allowFontScaling\s*=\s*\{false\}/.test(source)) {
    failures.push(
      `${relative(MOBILE_DIR, path)} disables the operating-system font scale`,
    )
  }
}

if (failures.length > 0) {
  console.error("Mobile large-text layout check failed.")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Mobile large-text layout check passed.")
