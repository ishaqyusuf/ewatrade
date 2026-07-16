import * as Crypto from "expo-crypto"
import * as SecureStore from "expo-secure-store"

export const APP_LOCK_CODE_LENGTH = 6
export const APP_LOCK_MAX_FAILED_ATTEMPTS = 5
export const APP_LOCK_LOCKOUT_MS = 30_000

const APP_LOCK_KEY_PREFIX = "ewatrade_mobile_app_lock"
const APP_LOCK_VERSION = 1

export type AppLockConfig = {
  biometricsEnabled: boolean
  codeHash: string
  createdAt: string
  enabled: boolean
  failedAttemptCount: number
  lastFailedAt?: string | null
  lastUnlockedAt?: string | null
  lockedUntil?: string | null
  salt: string
  updatedAt: string
  version: typeof APP_LOCK_VERSION
}

export type AppLockVerificationResult =
  | { config: AppLockConfig; ok: true }
  | {
      config: AppLockConfig | null
      lockedUntil?: string | null
      ok: false
      reason: "invalid" | "locked" | "missing"
    }

function appLockKeyForUser(userId: string) {
  const cleanUserId = userId.trim().replace(/[^a-zA-Z0-9._-]/g, "_")
  return `${APP_LOCK_KEY_PREFIX}_${cleanUserId || "unknown"}`
}

function normalizeCode(code: string) {
  return code.replace(/\D/g, "").slice(0, APP_LOCK_CODE_LENGTH)
}

export function isValidAppLockCode(code: string) {
  return normalizeCode(code) === code && code.length === APP_LOCK_CODE_LENGTH
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

async function hashCode(code: string, salt: string) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${code}`,
  )
}

function parseConfig(value: string | null): AppLockConfig | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as Partial<AppLockConfig>
    if (
      parsed.version !== APP_LOCK_VERSION ||
      typeof parsed.codeHash !== "string" ||
      typeof parsed.salt !== "string" ||
      typeof parsed.enabled !== "boolean"
    ) {
      return null
    }

    return {
      biometricsEnabled: !!parsed.biometricsEnabled,
      codeHash: parsed.codeHash,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
      enabled: parsed.enabled,
      failedAttemptCount: parsed.failedAttemptCount ?? 0,
      lastFailedAt: parsed.lastFailedAt ?? null,
      lastUnlockedAt: parsed.lastUnlockedAt ?? null,
      lockedUntil: parsed.lockedUntil ?? null,
      salt: parsed.salt,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      version: APP_LOCK_VERSION,
    }
  } catch {
    return null
  }
}

async function saveAppLockConfig(userId: string, config: AppLockConfig) {
  await SecureStore.setItemAsync(
    appLockKeyForUser(userId),
    JSON.stringify(config),
  )
  return config
}

export async function getAppLockConfig(userId: string) {
  const value = await SecureStore.getItemAsync(appLockKeyForUser(userId))
  return parseConfig(value)
}

export async function setAppLockCode(userId: string, code: string) {
  if (!isValidAppLockCode(code)) {
    throw new Error("App lock code must be 6 digits.")
  }

  const now = new Date().toISOString()
  const existing = await getAppLockConfig(userId)
  const salt = bytesToHex(await Crypto.getRandomBytesAsync(16))
  const codeHash = await hashCode(code, salt)

  return saveAppLockConfig(userId, {
    biometricsEnabled: existing?.biometricsEnabled ?? false,
    codeHash,
    createdAt: existing?.createdAt ?? now,
    enabled: true,
    failedAttemptCount: 0,
    lastFailedAt: null,
    lastUnlockedAt: now,
    lockedUntil: null,
    salt,
    updatedAt: now,
    version: APP_LOCK_VERSION,
  })
}

export async function setAppLockBiometrics(userId: string, enabled: boolean) {
  const existing = await getAppLockConfig(userId)
  if (!existing) return null

  return saveAppLockConfig(userId, {
    ...existing,
    biometricsEnabled: enabled,
    updatedAt: new Date().toISOString(),
  })
}

export async function recordAppLockUnlock(userId: string) {
  const existing = await getAppLockConfig(userId)
  if (!existing) return null

  return saveAppLockConfig(userId, {
    ...existing,
    failedAttemptCount: 0,
    lastFailedAt: null,
    lastUnlockedAt: new Date().toISOString(),
    lockedUntil: null,
    updatedAt: new Date().toISOString(),
  })
}

export async function clearAppLock(userId: string) {
  await SecureStore.deleteItemAsync(appLockKeyForUser(userId))
}

export async function verifyAppLockCode(
  userId: string,
  code: string,
): Promise<AppLockVerificationResult> {
  const config = await getAppLockConfig(userId)

  if (!config?.enabled) {
    return { config, ok: false, reason: "missing" }
  }

  const nowMs = Date.now()
  const lockedUntilMs = config.lockedUntil
    ? new Date(config.lockedUntil).getTime()
    : 0

  if (Number.isFinite(lockedUntilMs) && lockedUntilMs > nowMs) {
    return {
      config,
      lockedUntil: config.lockedUntil,
      ok: false,
      reason: "locked",
    }
  }

  const normalizedCode = normalizeCode(code)
  const submittedHash = await hashCode(normalizedCode, config.salt)

  if (
    normalizedCode.length === APP_LOCK_CODE_LENGTH &&
    submittedHash === config.codeHash
  ) {
    const nextConfig = await saveAppLockConfig(userId, {
      ...config,
      failedAttemptCount: 0,
      lastFailedAt: null,
      lastUnlockedAt: new Date().toISOString(),
      lockedUntil: null,
      updatedAt: new Date().toISOString(),
    })

    return { config: nextConfig, ok: true }
  }

  const failedAttemptCount = config.failedAttemptCount + 1
  const lockedUntil =
    failedAttemptCount >= APP_LOCK_MAX_FAILED_ATTEMPTS
      ? new Date(nowMs + APP_LOCK_LOCKOUT_MS).toISOString()
      : null

  const nextConfig = await saveAppLockConfig(userId, {
    ...config,
    failedAttemptCount: lockedUntil ? 0 : failedAttemptCount,
    lastFailedAt: new Date().toISOString(),
    lockedUntil,
    updatedAt: new Date().toISOString(),
  })

  return {
    config: nextConfig,
    lockedUntil,
    ok: false,
    reason: lockedUntil ? "locked" : "invalid",
  }
}
