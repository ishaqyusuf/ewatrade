const ANDROID_EMULATOR_HOSTS = ["10.0.2.2", "10.0.3.2"]

export function resolveStorefrontAllowedDevOrigins(value?: string) {
  const configured = value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)

  return [...new Set(configured?.length ? configured : ANDROID_EMULATOR_HOSTS)]
}
