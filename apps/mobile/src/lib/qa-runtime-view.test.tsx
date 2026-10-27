import { afterAll, expect, mock, test } from "bun:test"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

mock.module("@/components/ui/modal", () => ({
  Modal: () => null,
  useModal: () => ({}),
}))
mock.module("@/components/ui/pressable", () => ({ Pressable: () => null }))
mock.module("@/components/ui/text", () => ({
  Text: ({ children, testID }: { children: ReactNode; testID?: string }) =>
    createElement("span", { "data-testid": testID }, children),
}))
mock.module("@/components/ui/view", () => ({
  View: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}))
mock.module("@/hooks/use-auth", () => ({ useAuthContext: () => ({}) }))
mock.module("@/hooks/use-qa-accelerator", () => ({
  useQaAccelerator: () => ({}),
}))
mock.module("@gorhom/bottom-sheet", () => ({
  BottomSheetScrollView: () => null,
}))
mock.module("expo-router", () => ({ useRouter: () => ({}) }))
mock.module("expo-constants", () => ({
  default: { platform: { android: { versionCode: 35 } } },
}))
mock.module("expo-updates", () => ({
  isEnabled: true,
  isEmbeddedLaunch: false,
  isEmergencyLaunch: false,
  updateId: "candidate-update",
}))
mock.module("@/components/mobile/status-banner", () => ({
  StatusBanner: () => null,
}))

afterAll(() => mock.restore())

test("the actual QA chooser view renders the installed runtime identity", async () => {
  const { QaDomainIntro } = await import(
    "../components/mobile/qa-account-chooser"
  )
  const html = renderToStaticMarkup(
    createElement(QaDomainIntro, { qaDomain: "fixture.qa.test" }),
  )
  expect(html).toContain("fixture.qa.test")
  expect(html).toContain('data-testid="qa-runtime-identity"')
  expect(html).toContain("QA runtime candidate-update · build 35")
})
