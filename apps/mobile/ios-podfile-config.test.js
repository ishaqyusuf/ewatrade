import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { addGoogleSignInModularHeaders } from "./plugins/with-google-signin-modular-headers.cjs"

const appConfig = readFileSync(
  new URL("./app.config.ts", import.meta.url),
  "utf8",
)
describe("iOS Google Sign-In CocoaPods configuration", () => {
  test("applies the durable modular-header config plugin idempotently", () => {
    expect(appConfig).toContain("withGoogleSignInModularHeaders(config)")
    const input = "target 'EwatradeDev' do\n  use_expo_modules!\nend\n"
    const configured = addGoogleSignInModularHeaders(input)
    expect(configured).toContain(
      "pod 'GoogleUtilities', :modular_headers => true",
    )
    expect(configured).toContain(
      "pod 'RecaptchaInterop', :modular_headers => true",
    )
    expect(addGoogleSignInModularHeaders(configured)).toBe(configured)
  })
})
