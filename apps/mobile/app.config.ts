import type { ExpoConfig } from "expo/config"

const designRelease =
  require("./src/lib/mobile-design/release-config.json") as {
    defaultDesign: string
    screens: Record<string, string>
  }

const { withGoogleSignInModularHeaders } =
  require("./plugins/with-google-signin-modular-headers.cjs") as {
    withGoogleSignInModularHeaders: (config: ExpoConfig) => ExpoConfig
  }

export const UPDATE_VERSION = "2026.09.22"

const PROJECT = {
  id: "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b",
  slug: "ewatrade",
  owner: "cipron-startups",
}
const { id: PROJECT_ID, slug: SLUG, owner: OWNER } = PROJECT
const { resolveAppVariant } = require("./app-variant.cjs") as {
  resolveAppVariant: (env: NodeJS.ProcessEnv) => string
}
const normalizedAppVariant = resolveAppVariant({
  APP_ENV: process.env.APP_ENV,
  APP_VARIANT: process.env.APP_VARIANT,
  EXPO_PUBLIC_APP_VARIANT: process.env.EXPO_PUBLIC_APP_VARIANT,
  EAS_BUILD_PROFILE: process.env.EAS_BUILD_PROFILE,
})
const { getOnboardingLinkConfig } = require("./onboarding-link-config.cjs") as {
  getOnboardingLinkConfig: (
    variant: string,
    configured?: string,
  ) => {
    dashboardUrl: string
    host: string | null
    paths: string[]
  } | null
}
const onboardingLinks = getOnboardingLinkConfig(
  normalizedAppVariant,
  process.env.EXPO_PUBLIC_DASHBOARD_URL,
)
// Store signing identity is separate from the Preview runtime/service variant.
const isTestFlightPreview = process.env.IOS_TESTFLIGHT === "1"
if (isTestFlightPreview && normalizedAppVariant !== "preview") {
  throw new Error("TestFlight Preview requires the Preview app variant.")
}
const isDevelopmentBuild =
  normalizedAppVariant === "development" || normalizedAppVariant === "dev"
const isPreviewBuild = normalizedAppVariant === "preview"
const nativeSplashDesign =
  designRelease.screens["startup-splash"] ?? designRelease.defaultDesign
const autoUpdateOnForeground =
  process.env.EXPO_PUBLIC_AUTO_UPDATE_ON_FOREGROUND !== "false"
const autoUpdateForegroundCooldownMs = Number(
  process.env.EXPO_PUBLIC_AUTO_UPDATE_FOREGROUND_COOLDOWN_MS ?? 5 * 60 * 1000,
)
const googleIosUrlScheme = getGoogleIosUrlScheme(
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??
    process.env.GOOGLE_IOS_CLIENT_ID,
)
const customerChatHost =
  process.env.EXPO_PUBLIC_CUSTOMER_CHAT_HOST?.trim() || "chat.ewatrade.com"
const googleSignInPlugin: NonNullable<ExpoConfig["plugins"]> =
  googleIosUrlScheme
    ? [
        [
          "@react-native-google-signin/google-signin",
          {
            iosUrlScheme: googleIosUrlScheme,
          },
        ],
      ]
    : []

const variantConfig = isDevelopmentBuild
  ? {
      name: "ẸwáTrade Dev",
      scheme: "ewatrade-dev",
      iosBundleIdentifier: "com.ewatrade.dev",
      androidPackage: "com.ewatrade.dev",
      iconBackgroundColor: "#1769B0",
      splashBackgroundColor: "#1769B0",
      splashDarkBackgroundColor: "#082B3B",
      icons: {
        app: "./assets/icons/dev-precision-rise-loading-icon.png",
        adaptive: "./assets/icons/dev-precision-rise-adaptive-icon.png",
        iosDark: "./assets/icons/dev-precision-rise-ios-dark.png",
        iosLight: "./assets/icons/dev-precision-rise-ios-light.png",
        splashDark: "./assets/icons/dev-precision-rise-splash-logo-dark.png",
        splashLight: "./assets/icons/dev-precision-rise-splash-logo.png",
      },
    }
  : isPreviewBuild
    ? {
        name: "ẸwáTrade Preview",
        scheme: "ewatrade-preview",
        iosBundleIdentifier: "com.ewatrade.preview",
        androidPackage: "com.ewatrade.preview",
        iconBackgroundColor: "#25123B",
        splashBackgroundColor: "#25123B",
        splashDarkBackgroundColor: "#170B25",
        icons: {
          app: "./assets/icons/preview-precision-rise-loading-icon.png",
          adaptive: "./assets/icons/preview-precision-rise-adaptive-icon.png",
          iosDark: "./assets/icons/preview-precision-rise-ios-dark.png",
          iosLight: "./assets/icons/preview-precision-rise-ios-light.png",
          splashDark:
            "./assets/icons/preview-precision-rise-splash-logo-dark.png",
          splashLight: "./assets/icons/preview-precision-rise-splash-logo.png",
        },
      }
    : {
        name: "ẸwáTrade",
        scheme: "ewatrade",
        iosBundleIdentifier: "com.ewatrade.app",
        androidPackage: "com.ewatrade.app",
        iconBackgroundColor: "#FFF8E9",
        splashBackgroundColor: "#FFF8E9",
        splashDarkBackgroundColor: "#08372A",
        icons: {
          app: "./assets/icons/precision-rise-loading-icon.png",
          adaptive: "./assets/icons/precision-rise-adaptive-icon.png",
          iosDark: "./assets/icons/precision-rise-ios-dark.png",
          iosLight: "./assets/icons/precision-rise-ios-light.png",
          splashDark: "./assets/icons/precision-rise-splash-logo-dark.png",
          splashLight: "./assets/icons/precision-rise-splash-logo.png",
        },
      }

const nativeSplashImageLight = variantConfig.icons.splashDark
const nativeSplashImageDark = variantConfig.icons.splashDark
const nativeSplashBackgroundColor = "#17684F"
const nativeSplashDarkBackgroundColor =
  nativeSplashDesign === "market-day" ? "#17684F" : "#17543F"

// App-owned data sent to the EwaTrade API. SDK-owned collection remains in
// each SDK's manifest and the final Xcode privacy report.
const appOwnedPrivacyDataTypes = [
  "NSPrivacyCollectedDataTypeName",
  "NSPrivacyCollectedDataTypeEmailAddress",
  "NSPrivacyCollectedDataTypePhoneNumber",
  "NSPrivacyCollectedDataTypePhysicalAddress",
  "NSPrivacyCollectedDataTypeOtherDataTypes",
  "NSPrivacyCollectedDataTypeUserID",
  "NSPrivacyCollectedDataTypeDeviceID",
  "NSPrivacyCollectedDataTypePaymentInfo",
  "NSPrivacyCollectedDataTypeOtherFinancialInfo",
  "NSPrivacyCollectedDataTypePurchaseHistory",
  "NSPrivacyCollectedDataTypeEmailsOrTextMessages",
  "NSPrivacyCollectedDataTypePhotosorVideos",
  "NSPrivacyCollectedDataTypeAudioData",
  "NSPrivacyCollectedDataTypeOtherUserContent",
].map((NSPrivacyCollectedDataType) => ({
  NSPrivacyCollectedDataType,
  NSPrivacyCollectedDataTypeLinked: true,
  NSPrivacyCollectedDataTypeTracking: false,
  NSPrivacyCollectedDataTypePurposes: [
    "NSPrivacyCollectedDataTypePurposeAppFunctionality",
  ],
}))

const config: ExpoConfig = {
  name: variantConfig.name,
  slug: SLUG,
  owner: OWNER,
  version: "1.0.0",
  orientation: "portrait",
  icon: variantConfig.icons.app,
  scheme: variantConfig.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  updates: {
    url: `https://u.expo.dev/${PROJECT_ID}`,
    checkAutomatically: "NEVER",
  },
  runtimeVersion: {
    policy: "fingerprint",
  },
  ios: {
    usesAppleSignIn: true,
    associatedDomains: [
      ...new Set([
        `applinks:${customerChatHost}`,
        ...(onboardingLinks?.host ? [`applinks:${onboardingLinks.host}`] : []),
      ]),
    ],
    supportsTablet: true,
    bundleIdentifier: isTestFlightPreview
      ? "com.ewatrade.app"
      : variantConfig.iosBundleIdentifier,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
    privacyManifests: {
      NSPrivacyCollectedDataTypes: appOwnedPrivacyDataTypes,
      NSPrivacyTracking: false,
    },
    icon: {
      dark: variantConfig.icons.iosDark,
      light: variantConfig.icons.iosLight,
    },
  },
  android: {
    blockedPermissions: [
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
      "com.android.vending.BILLING",
      // Location is only used while the app is open, to fill an address.
      "android.permission.ACCESS_BACKGROUND_LOCATION",
      ...(!isDevelopmentBuild
        ? ["android.permission.SYSTEM_ALERT_WINDOW"]
        : []),
    ],
    adaptiveIcon: {
      backgroundColor: variantConfig.iconBackgroundColor,
      foregroundImage: variantConfig.icons.adaptive,
    },
    // edgeToEdgeEnabled: false,
    predictiveBackGestureEnabled: false,
    package: variantConfig.androidPackage,
    intentFilters: [
      ...(onboardingLinks?.host
        ? [
            {
              action: "VIEW",
              autoVerify: true,
              category: ["BROWSABLE", "DEFAULT"],
              data: onboardingLinks.paths.map((path) => ({
                scheme: "https",
                host: onboardingLinks.host ?? undefined,
                path,
              })),
            },
          ]
        : []),
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: [
          {
            host: customerChatHost,
            pathPrefix: "/r/",
            scheme: "https",
          },
        ],
      },
    ],
  },
  web: {
    output: "static",
    favicon: "./assets/images/precision-rise-favicon.png",
  },
  plugins: [
    "./plugins/with-variant-link-schemes.cjs",
    "./plugins/with-app-update.cjs",
    "./plugins/with-foreground-audio-only.cjs",
    "./plugins/with-ios-pod-deployment-target.cjs",
    "expo-apple-authentication",
    [
      "@sentry/react-native/expo",
      {
        url: "https://sentry.io/",
        project: "ewatrade-mobile",
        organization: "cipron-concepts",
      },
    ],
    "expo-router",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Allow $(PRODUCT_NAME) to use your location to fill in your business address.",
        isAndroidBackgroundLocationEnabled: false,
        isIosBackgroundLocationEnabled: false,
      },
    ],
    "expo-font",
    "expo-asset",
    [
      "expo-camera",
      {
        cameraPermission:
          "Allow $(PRODUCT_NAME) to scan product barcodes and capture photos.",
        recordAudioAndroid: false,
        barcodeScannerEnabled: true,
      },
    ],
    [
      "expo-audio",
      {
        microphonePermission:
          "Allow $(PRODUCT_NAME) to record a private voice note for the Store conversation you choose.",
      },
    ],
    "expo-secure-store",
    "expo-web-browser",
    "@react-native-community/datetimepicker",
    [
      "expo-local-authentication",
      {
        faceIDPermission:
          "Allow $(PRODUCT_NAME) to use Face ID to unlock your ẸwáTrade workspace.",
      },
    ],
    [
      "expo-image-picker",
      {
        cameraPermission:
          "Allow $(PRODUCT_NAME) to capture intake photos for service orders.",
        microphonePermission:
          "Allow $(PRODUCT_NAME) to record short intake videos for service orders.",
        photosPermission:
          "Allow $(PRODUCT_NAME) to attach intake media to service orders.",
      },
    ],
    ...googleSignInPlugin,
    [
      "expo-navigation-bar",
      {
        enforceContrast: false,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: nativeSplashImageLight,
        imageWidth: 170,
        resizeMode: "contain",
        backgroundColor: nativeSplashBackgroundColor,
        dark: {
          image: nativeSplashImageDark,
          backgroundColor: nativeSplashDarkBackgroundColor,
        },
      },
    ],
  ],
  experiments: {
    autolinkingModuleResolution: true,
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    onboardingDashboardUrl: onboardingLinks?.dashboardUrl,
    appVariant: normalizedAppVariant,
    autoUpdateOnForeground,
    autoUpdateForegroundCooldownMs: Number.isFinite(
      autoUpdateForegroundCooldownMs,
    )
      ? autoUpdateForegroundCooldownMs
      : 5 * 60 * 1000,
    updateVersion: UPDATE_VERSION,
    eas: {
      projectId: PROJECT_ID,
    },
    owner: OWNER,
    updates: {
      url: `https://u.expo.dev/${PROJECT_ID}`,
      checkAutomatically: "NEVER",
    },
    runtimeVersion: {
      policy: "fingerprint",
    },
    router: {},
  },
}

export default withGoogleSignInModularHeaders(config)

function getPrimaryGoogleClientId(value?: string) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .find(Boolean) ?? ""
  )
}

function getGoogleIosUrlScheme(value?: string) {
  const clientId = getPrimaryGoogleClientId(value)
  const googleSuffix = ".apps.googleusercontent.com"

  if (!clientId.endsWith(googleSuffix)) return undefined

  return `com.googleusercontent.apps.${clientId.slice(0, -googleSuffix.length)}`
}
