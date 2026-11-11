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
    // The operational dock keeps one line just above normal size at large
    // text (3 Nov 2026): wider labels collided and two lines pushed icons
    // out of the dock. Other variants still wrap to two lines.
    file: "components/mobile/bottom-tab-item.tsx",
    markers: [
      "useLargeTextLayout",
      "DISPLAY_TEXT_FONT_SCALE_CAP",
      "DOCK_LABEL_LARGE_TEXT_SCALE_CAP = 1.15",
      "numberOfLines={largeTextLayout ? 2 : 1}",
    ],
  },
  {
    // QA entry is the keyboard inline composer (fbc699e11, 8 Oct 2026); the
    // composer stacks the field over a labelled button at large text, and the
    // QA hint is shortened so it does not clip in the one-line field.
    file: "components/mobile/qa-authorization-sheet.tsx",
    markers: [
      "<KeyboardInlineComposer",
      'largeTextPlaceholder="QA domain"',
      'submitLabel={retryServer ? "Retry" : "Load QA businesses"}',
    ],
  },
  {
    // Green Till 03 auth shell (login, sign-up age, verify, onboarding,
    // no-access): at large text the mint stage collapses and its preview
    // cards are dropped so the form starts near the top.
    file: "components/mobile/green-till/auth-screen.tsx",
    markers: [
      "useLargeTextLayout",
      "const LARGE_TEXT_STAGE_HEIGHT = 120",
      "? LARGE_TEXT_STAGE_HEIGHT",
      "largeText || stageCollapsed",
    ],
  },
  {
    // AuthListRow (no-access, age) top-aligns its icon, control and chevron
    // with the first line once the copy wraps.
    file: "components/mobile/green-till/auth-list.tsx",
    markers: [
      "useLargeTextLayout",
      '"min-h-11 flex-row items-start gap-3 py-3"',
      "marginTop: largeTextLayout ? 4 : 0",
      'className={largeTextLayout ? "mt-2.5" : undefined}',
    ],
  },
  {
    // app/login.tsx renders this screen.
    file: "components/mobile/login/login-screen.tsx",
    markers: [
      "useLargeTextLayout",
      "<ClassicLoginScreen",
      'largeTextLayout ? "gap-1" : "flex-row items-center justify-center"',
      'largeTextLayout ? "w-full" : "flex-1"',
    ],
  },
  {
    file: "components/mobile/appearances/classic/login-screen.tsx",
    markers: ["<GreenTillAuthScreen"],
  },
  {
    // app/sign-up.tsx renders the owner account form.
    file: "components/mobile/sign-up/owner-account-screen.tsx",
    markers: [
      "useLargeTextLayout",
      'className={largeText ? "gap-2" : "flex-row flex-wrap gap-2"}',
    ],
  },
  {
    file: "components/mobile/sign-up/owner-store-step.tsx",
    markers: [
      "useLargeTextLayout",
      'flexDirection: largeText ? "column" : "row"',
      "numberOfLines={largeText ? undefined : 1}",
    ],
  },
  {
    file: "components/mobile/sign-up/owner-type-picker.tsx",
    markers: [
      "useLargeTextLayout",
      'flexDirection: largeText ? "column" : "row"',
    ],
  },
  {
    // app/no-access.tsx renders this screen on the auth shell.
    file: "components/mobile/green-till/no-access-screen.tsx",
    markers: [
      "<GreenTillAuthScreen",
      'title="No business on this account yet"',
      "<AuthListRow",
    ],
  },
  {
    // app/verify-email.tsx: auth shell + Green Till OTP cells and keypad.
    file: "components/mobile/appearances/classic/verify-email-screen.tsx",
    markers: ["<GreenTillAuthScreen", "stage={<VerifyStage"],
  },
  {
    file: "components/mobile/verify-email/verify-email-screen.tsx",
    markers: ["<OtpInput", "<OtpKeypad", 'variant="green-till"'],
  },
  {
    // app/onboarding.tsx: intro copy on the auth shell (stage collapses).
    file: "components/mobile/appearances/classic/onboarding-screen.tsx",
    markers: ["<GreenTillAuthScreen", "stage={<IntroStage"],
  },
  {
    file: "components/mobile/otp-input.tsx",
    markers: [
      "useLargeTextLayout",
      'largeTextLayout ? "h-[64px]" : "h-[54px]"',
      'largeTextLayout ? "h-16 w-12" : "h-14 w-10"',
    ],
  },
  {
    file: "components/mobile/otp-keypad.tsx",
    markers: ["useLargeTextLayout", "defaultKeyHeightClassName"],
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
      "isLoading={loading}",
    ],
  },
  {
    file: "components/mobile/customer-conversations/customer-shell-header.tsx",
    markers: [
      "useLargeTextLayout",
      "numberOfLines={largeTextLayout ? 2 : 1}",
      '? "gap-2 bg-background px-[18px] pb-4"',
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
      '"min-h-[112px] flex-row items-start gap-3.5',
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
    // catalog-items-sheet.tsx re-exports the Catalog items list and add sheet.
    file: "components/mobile/catalog/catalog-screen.tsx",
    markers: [
      "useLargeTextLayout",
      'largeTextLayout && "flex-wrap"',
      "height * (largeTextLayout ? 0.92 : 0.8)",
      '? "min-h-14 flex-row items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3"',
    ],
  },
  {
    file: "components/mobile/appearances/classic/catalog-screen.tsx",
    markers: [
      "useLargeTextLayout",
      'largeText ? "items-start" : "items-center"',
      "numberOfLines={largeText ? undefined : 1}",
      'largeText ? "items-start" : "max-w-[44%] items-end"',
      'largeText ? "min-h-11 grow px-3" : "min-w-0 flex-1"',
      "const showCount = count !== undefined && !largeText",
    ],
  },
  {
    // admin-more-screen.tsx re-exports More; its classic appearance and the
    // shared Green Till RecordRow own the large-text branches.
    file: "components/mobile/appearances/classic/more-screen.tsx",
    markers: [
      "useLargeTextLayout",
      'largeTextLayout\n          ? "mb-5 items-start gap-3"',
      'largeTextLayout ? "min-w-0" : "min-w-0 flex-1"',
      "stackDetails",
    ],
  },
  {
    file: "components/mobile/green-till/kit.tsx",
    markers: [
      'stackDetails && largeText ? "items-start" : "flex-row items-center"',
      "const lines = largeText ? undefined : 1",
    ],
  },
  {
    file: "components/mobile/more/more-approval-card.tsx",
    markers: ["useLargeTextLayout", 'largeText ? "gap-2" : "flex-row gap-2"'],
  },
  {
    file: "components/mobile/more/more-sheets.tsx",
    markers: ["useLargeTextLayout", '!largeText && "flex-row"'],
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
    // simple-catalog-item-screen.tsx re-exports Catalog setup; its classic
    // appearance owns the large-text branches.
    file: "components/mobile/appearances/classic/catalog-setup.tsx",
    markers: [
      "useLargeTextLayout",
      'largeTextLayout ? "gap-3" : "flex-row gap-3"',
      'largeTextLayout ? undefined : "min-w-0 flex-1"',
      '"-mx-2 min-h-16 flex-row items-start gap-3',
      '? "mt-1 h-10 w-10 items-center justify-center rounded-2xl bg-muted"',
      '? "mt-1 size-sm text-muted-foreground"',
      '"-mx-2 min-h-16 flex-row items-start gap-3 border-b border-border bg-accent px-3 py-3"',
      '"-mx-2 min-h-16 flex-row items-start gap-3 border-b border-border px-3 py-3 active:bg-accent/60"',
      'largeTextLayout\n              ? "text-xs [-rn-line-height:22] text-muted-foreground"',
      '"mt-1 h-5 w-5 items-center justify-center rounded-full border-[6px] border-primary"',
      '? "mt-1 h-7 w-12 items-end justify-center rounded-full bg-primary px-1"',
      'largeTextLayout ? "gap-3" : "flex-row items-start justify-between gap-3"',
      'largeTextLayout ? "gap-1" : "min-w-0 flex-1 gap-1"',
      '"min-h-12 w-full flex-row items-center justify-center gap-2 rounded-full bg-muted px-5"',
      'largeTextLayout ? "gap-3" : "flex-row gap-3"',
      '"-mx-2 min-h-16 flex-row items-start gap-3 rounded-2xl px-3 py-3 active:bg-muted"',
      '"-mx-2 min-h-16 flex-row items-start gap-3 rounded-2xl px-3 py-3 active:bg-destructive/10"',
      "largeTextLayout && hasOptions",
      '"min-h-12 w-full flex-row items-center justify-center gap-2 rounded-full bg-muted px-5"',
      "export function CatalogEssentialsFields(",
    ],
  },
  {
    // The selling-unit editor left Catalog setup for a full-screen editor
    // (5495e83ed, 9 Oct 2026); its large-text branches live here now.
    file: "components/mobile/appearances/classic/selling-unit-editor.tsx",
    markers: [
      "useLargeTextLayout",
      'flexDirection: largeTextLayout ? "column" : "row"',
      'largeTextLayout ? "gap-2" : "flex-row gap-2"',
      'largeTextLayout ? "min-h-11 w-full py-2" : "min-h-9 flex-1"',
      'largeTextLayout ? "items-start" : "items-center"',
      "marginTop: largeTextLayout ? 9 : 0",
    ],
  },
  {
    // Catalog setup sheets size to their content; at large text they may
    // rise to 92% so actions are not pushed below a scroll.
    file: "components/mobile/catalog-setup/catalog-setup-confirmation.tsx",
    markers: [
      "useLargeTextLayout",
      "BottomSheetScrollView",
      "height * (largeTextLayout ? 0.92 : 0.44)",
    ],
  },
  {
    file: "components/mobile/catalog-setup/selling-unit-reference-selector.tsx",
    markers: [
      "useLargeTextLayout",
      "BottomSheetScrollView",
      "height * (largeTextLayout ? 0.92 : 0.65)",
    ],
  },
  {
    file: "components/mobile/appearances/classic/catalog-helper-picker.tsx",
    markers: [
      "useLargeTextLayout",
      'largeTextLayout\n          ? "min-h-20 flex-row items-start',
      "largeTextLayout && badgeLabel",
      '? "mt-1 size-sm text-muted-foreground"',
    ],
  },
  {
    // Split on 19 Oct 2026: the list no longer truncates names and the
    // actions sheet sizes to its content, so only the editor keeps branches.
    file: "components/mobile/catalog-setup/catalog-variant-manager.tsx",
    markers: ["enableDynamicSizing"],
  },
  {
    file: "components/mobile/catalog-setup/catalog-variant-basics.tsx",
    markers: [
      "useLargeTextLayout",
      'largeTextLayout ? "gap-3" : "flex-row gap-3"',
      'largeTextLayout && kind === "product" && !editorUnit',
    ],
  },
  {
    file: "components/mobile/catalog-setup/catalog-variant-details.tsx",
    markers: [
      "useLargeTextLayout",
      '? "-mx-2 min-h-16 flex-row items-start gap-3 border-y border-border px-3 py-3 pr-3"',
    ],
  },
  {
    file: "components/mobile/auth-header.tsx",
    markers: [
      "useLargeTextLayout",
      '"flex-row items-center"',
      '"w-full text-left"',
      "numberOfLines={largeTextLayout ? 2 : 1}",
      "paddingVertical: largeTextLayout ? 8 : 0",
    ],
  },
  {
    file: "components/mobile/form-field.tsx",
    markers: [
      "useLargeTextLayout",
      "largeTextLayout ? 64 : 50",
      "const shouldShowLabel = !isAuthVariant || largeTextLayout",
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
