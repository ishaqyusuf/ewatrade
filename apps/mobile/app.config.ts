import type { ExpoConfig } from "expo/config"

const designRelease = require("./src/lib/mobile-design/release-config.json") as {
  defaultDesign: string
  screens: Record<string, string>
}

const { withGoogleSignInModularHeaders } =
  require("./plugins/with-google-signin-modular-headers.cjs") as {
    withGoogleSignInModularHeaders: (config: ExpoConfig) => ExpoConfig
  }

export const UPDATE_VERSION = "2026.09.11"

const PROJECT = {
  default: {
    id: "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b",
    slug: "ewatrade",
    owner: "cipron-startups",
  },
  fallback: {
    id: "5d765962-42a1-4a9e-a01c-122149c3cec4",
    slug: "ewatrade-2",
    owner: "startups-2",
  },
}
const { id: PROJECT_ID, slug: SLUG, owner: OWNER } = PROJECT.default
const appVariant =
  process.env.APP_VARIANT ??
  process.env.EXPO_PUBLIC_APP_VARIANT ??
  (process.env.EAS_BUILD_PROFILE === "development" ? "development" : undefined)

const normalizedAppVariant = (appVariant ?? "production").toLowerCase()
const isDevelopmentBuild =
  normalizedAppVariant === "development" || normalizedAppVariant === "dev"
const isPreviewBuild = normalizedAppVariant === "preview"
const nativeSplashDesign = designRelease.screens["startup-splash"] ?? designRelease.defaultDesign
const nativeSplashImage = nativeSplashDesign === "market-day"
  ? "./assets/icons/market-pulse-splash-mark.png"
  : isDevelopmentBuild || isPreviewBuild
    ? "./assets/icons/dev-splash-logo.png"
    : "./assets/icons/splash-logo.png"
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
      iconBackgroundColor: "#FEE2E2",
      icons: {
        app: "./assets/icons/dev-loading-icon.png",
        adaptive: "./assets/icons/dev-adaptive-icon.png",
        iosDark: "./assets/icons/dev-ios-dark.png",
        iosLight: "./assets/icons/dev-ios-light.png",
      },
    }
  : isPreviewBuild
    ? {
        name: "ẸwáTrade Preview",
        scheme: "ewatrade-preview",
        iosBundleIdentifier: "com.ewatrade.preview",
        androidPackage: "com.ewatrade.preview",
        iconBackgroundColor: "#FEF3C7",
        icons: {
          app: "./assets/icons/dev-loading-icon.png",
          adaptive: "./assets/icons/dev-adaptive-icon.png",
          iosDark: "./assets/icons/dev-ios-dark.png",
          iosLight: "./assets/icons/dev-ios-light.png",
        },
      }
    : {
        name: "ẸwáTrade",
        scheme: "ewatrade",
        iosBundleIdentifier: "com.ewatrade.app",
        androidPackage: "com.ewatrade.app",
        iconBackgroundColor: "#E6F4FE",
        icons: {
          app: "./assets/icons/loading-icon.png",
          adaptive: "./assets/icons/adaptive-icon.png",
          iosDark: "./assets/icons/ios-dark.png",
          iosLight: "./assets/icons/ios-light.png",
        },
      }

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
    policy: "appVersion",
  },
  ios: {
    associatedDomains: [`applinks:${customerChatHost}`],
    supportsTablet: true,
    bundleIdentifier: variantConfig.iosBundleIdentifier,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
    icon: {
      dark: variantConfig.icons.iosDark,
      light: variantConfig.icons.iosLight,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: variantConfig.iconBackgroundColor,
      foregroundImage: variantConfig.icons.adaptive,
    },
    // edgeToEdgeEnabled: false,
    predictiveBackGestureEnabled: false,
    package: variantConfig.androidPackage,
    intentFilters: [
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
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    [
      "@sentry/react-native/expo",
      {
        url: "https://sentry.io/",
        project: "ewatrade-mobile",
        organization: "cipron-concepts",
      },
    ],
    "expo-router",
    "expo-font",
    "expo-asset",
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
        image: nativeSplashImage,
        imageWidth: 170,
        resizeMode: "contain",
        backgroundColor: nativeSplashDesign === "market-day" ? "#17684F" : "#ffffff",
        dark: {
          image: nativeSplashImage,
          backgroundColor: nativeSplashDesign === "market-day" ? "#17684F" : "#000000",
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
      policy: "appVersion",
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
