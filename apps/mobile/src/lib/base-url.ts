import Constants from "expo-constants";

const DEFAULT_API_PORT = "3095";
const DEFAULT_WEB_PORT = "3092";

const getLocalPort = (value: string | undefined, fallback: string) =>
  value?.trim() || fallback;

const getDebuggerHostname = () => {
  const debuggerHost = Constants.expoConfig?.hostUri;
  return debuggerHost?.split(":")[0] ?? null;
};

const localHostnames = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

const resolveReachableLocalUrl = (value: string) => {
  const trimmed = value.replace(/\/$/, "");
  const debuggerHostname = getDebuggerHostname();
  if (!debuggerHostname) return trimmed;

  try {
    const url = new URL(trimmed);
    if (!localHostnames.has(url.hostname)) return trimmed;

    url.hostname = debuggerHostname;
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed;
  }
};

export const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return resolveReachableLocalUrl(process.env.EXPO_PUBLIC_API_URL);
  }

  const localhost = getDebuggerHostname();
  if (!localhost) {
    throw new Error(
      "EXPO_PUBLIC_API_URL must be set when a local Expo host is unavailable.",
    );
  }

  return `http://${localhost}:${getLocalPort(
    process.env.EXPO_PUBLIC_API_PORT,
    DEFAULT_API_PORT,
  )}`;
};

export const getWebUrl = () => {
  if (process.env.EXPO_PUBLIC_WEB_URL) {
    return resolveReachableLocalUrl(process.env.EXPO_PUBLIC_WEB_URL);
  }

  const localhost = getDebuggerHostname();
  if (!localhost) {
    throw new Error(
      "EXPO_PUBLIC_WEB_URL must be set when a local Expo host is unavailable.",
    );
  }

  return `http://${localhost}:${getLocalPort(
    process.env.EXPO_PUBLIC_WEB_PORT,
    DEFAULT_WEB_PORT,
  )}`;
};
