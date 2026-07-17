import type { ExpoConfig } from "expo/config"

export const UPDATE_VERSION = "2026.07.17.01"
const PROJECT_ID = "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b"
const appVariant =
  process.env.APP_VARIANT ??
  process.env.EXPO_PUBLIC_APP_VARIANT ??
  (process.env.EAS_BUILD_PROFILE === "development" ? "development" : undefined)

const normalizedAppVariant = (appVariant ?? "production").toLowerCase()
const isDevelopmentBuild =
  normalizedAppVariant === "development" || normalizedAppVariant === "dev"
const autoUpdateOnForeground =
  process.env.EXPO_PUBLIC_AUTO_UPDATE_ON_FOREGROUND !== "false"
const autoUpdateForegroundCooldownMs = Number(
  process.env.EXPO_PUBLIC_AUTO_UPDATE_FOREGROUND_COOLDOWN_MS ?? 5 * 60 * 1000,
)
const googleIosUrlScheme = getGoogleIosUrlScheme(
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??
    process.env.GOOGLE_IOS_CLIENT_ID,
)
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
      name: "Ewatrade Dev",
      scheme: "ewatrade-dev",
      iosBundleIdentifier: "com.ewatrade.dev",
      androidPackage: "com.ewatrade.dev",
      iconBackgroundColor: "#FEE2E2",
      splashBackgroundColor: "#FFF5F5",
      splashDarkBackgroundColor: "#2A0505",
      icons: {
        app: "./assets/icons/dev-loading-icon.png",
        adaptive: "./assets/icons/dev-adaptive-icon.png",
        iosDark: "./assets/icons/dev-ios-dark.png",
        iosLight: "./assets/icons/dev-ios-light.png",
        splashLight: "./assets/icons/dev-splash-logo.png",
        splashDark: "./assets/icons/dev-splash-logo.png",
      },
    }
  : {
      name: "Ewatrade",
      scheme: "ewatrade",
      iosBundleIdentifier: "com.ewatrade.app",
      androidPackage: "com.ewatrade.app",
      iconBackgroundColor: "#E6F4FE",
      splashBackgroundColor: "#ffffff",
      splashDarkBackgroundColor: "#000000",
      icons: {
        app: "./assets/icons/loading-icon.png",
        adaptive: "./assets/icons/adaptive-icon.png",
        iosDark: "./assets/icons/ios-dark.png",
        iosLight: "./assets/icons/ios-light.png",
        splashLight: "./assets/icons/splash-logo.png",
        splashDark: "./assets/icons/splash-logo.png",
      },
    }

const config: ExpoConfig = {
  name: variantConfig.name,
  slug: "ewatrade",
  owner: "cipron-startups",
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
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-web-browser",
    [
      "expo-local-authentication",
      {
        faceIDPermission:
          "Allow $(PRODUCT_NAME) to use Face ID to unlock your EwaTrade workspace.",
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
        image: variantConfig.icons.splashLight,
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: variantConfig.splashBackgroundColor,
        dark: {
          backgroundColor: variantConfig.splashDarkBackgroundColor,
          image: variantConfig.icons.splashDark,
        },
      },
    ],
  ],
  experiments: {
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
    owner: "cipron-startups",
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

export default config

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
