import Constants from "expo-constants"
import { resolveMobileServiceUrl } from "./mobile-service-url"

const DEFAULT_API_PORT = "3095"
const DEFAULT_WEB_PORT = "3092"
const DEFAULT_CHAT_PORT = "3091"

const getDebuggerHostname = () => {
  const debuggerHost = Constants.expoConfig?.hostUri
  return debuggerHost?.split(":")[0] ?? null
}

export const getBaseUrl = () =>
  resolveMobileServiceUrl({
    configuredPort: process.env.EXPO_PUBLIC_API_PORT,
    configuredUrl: process.env.EXPO_PUBLIC_API_URL,
    debuggerHostname: getDebuggerHostname(),
    defaultPort: DEFAULT_API_PORT,
    requiredUrlName: "EXPO_PUBLIC_API_URL",
  })

export const getWebUrl = () =>
  resolveMobileServiceUrl({
    configuredPort: process.env.EXPO_PUBLIC_WEB_PORT,
    configuredUrl: process.env.EXPO_PUBLIC_WEB_URL,
    debuggerHostname: getDebuggerHostname(),
    defaultPort: DEFAULT_WEB_PORT,
    requiredUrlName: "EXPO_PUBLIC_WEB_URL",
  })

export const getChatUrl = () =>
  resolveMobileServiceUrl({
    configuredPort: process.env.EXPO_PUBLIC_CHAT_PORT,
    configuredUrl: process.env.EXPO_PUBLIC_CHAT_URL,
    debuggerHostname: getDebuggerHostname(),
    defaultPort: DEFAULT_CHAT_PORT,
    requiredUrlName: "EXPO_PUBLIC_CHAT_URL",
  })
