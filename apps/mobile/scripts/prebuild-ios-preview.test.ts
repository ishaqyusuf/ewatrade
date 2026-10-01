import { expect, test } from "bun:test"
import { assertIosPreviewConfig, parseEnvFile } from "./prebuild-ios-preview"

const preview = {
  APP_VARIANT: "preview",
  EXPO_PUBLIC_APP_VARIANT: "preview",
  EXPO_PUBLIC_BASE_URL: "https://web-preview.example.test",
  EXPO_PUBLIC_WEB_URL: "https://web-preview.example.test",
  EXPO_PUBLIC_API_URL: "https://api-preview.example.test",
  EXPO_PUBLIC_LEGAL_ORIGIN: "https://legal-preview.example.test",
  EXPO_PUBLIC_CHAT_URL: "https://chat-preview.example.test",
  EXPO_PUBLIC_CUSTOMER_CHAT_HOST: "chat-preview.example.test",
}
const rootPreview = { API_URL: preview.EXPO_PUBLIC_API_URL }
const production = {
  EXPO_PUBLIC_API_URL: "https://api.example.test",
  EXPO_PUBLIC_BASE_URL: "https://web.example.test",
  EXPO_PUBLIC_WEB_URL: "https://web.example.test",
  EXPO_PUBLIC_CHAT_URL: "https://chat.example.test",
}
const config = {
  owner: "cipron-startups",
  android: { package: "com.ewatrade.preview" },
  ios: {
    bundleIdentifier: "com.ewatrade.preview",
    associatedDomains: ["applinks:chat-preview.example.test"],
  },
  extra: {
    appVariant: "preview",
    eas: { projectId: "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b" },
  },
}

test("accepts the exact isolated Preview identity and hosts", () => {
  expect(() =>
    assertIosPreviewConfig(config, preview, rootPreview, production),
  ).not.toThrow()
})

test("rejects silently resolved Production identity before prebuild", () => {
  expect(() =>
    assertIosPreviewConfig(
      {
        ...config,
        ios: { ...config.ios, bundleIdentifier: "com.ewatrade.app" },
      },
      preview,
      rootPreview,
      production,
    ),
  ).toThrow("did not resolve the EwaTrade Preview")
})

test("rejects mismatched API and app-link targets", () => {
  expect(() =>
    assertIosPreviewConfig(
      config,
      { ...preview, EXPO_PUBLIC_API_URL: production.EXPO_PUBLIC_API_URL },
      rootPreview,
      production,
    ),
  ).toThrow("Preview mobile API must explicitly match")
  expect(() =>
    assertIosPreviewConfig(
      config,
      { ...preview, EXPO_PUBLIC_CUSTOMER_CHAT_HOST: "other.example.test" },
      rootPreview,
      production,
    ),
  ).toThrow("chat app-link host must match")
})

test("parses simple public dotenv values without comments", () => {
  expect(
    parseEnvFile(
      "# comment\nAPP_VARIANT=preview\nAPI_URL='https://api.example.test'\nVALUE=x # note\n",
    ),
  ).toEqual({
    APP_VARIANT: "preview",
    API_URL: "https://api.example.test",
    VALUE: "x",
  })
})
