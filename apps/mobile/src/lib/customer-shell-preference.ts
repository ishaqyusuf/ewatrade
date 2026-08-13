import AsyncStorage from "@react-native-async-storage/async-storage"

const LAST_MOBILE_SHELL_KEY = "ewatrade_last_mobile_shell_v1"

export type MobileShell = "business" | "customer"

export function normalizeLastMobileShell(value: string | null): MobileShell {
  return value === "customer" ? "customer" : "business"
}

export async function getLastMobileShell() {
  return normalizeLastMobileShell(
    await AsyncStorage.getItem(LAST_MOBILE_SHELL_KEY),
  )
}

export async function setLastMobileShell(shell: MobileShell) {
  await AsyncStorage.setItem(LAST_MOBILE_SHELL_KEY, shell)
}
