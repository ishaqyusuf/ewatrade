import type { Prisma } from "../../generated/prisma/client"
import { StoreStatus } from "../../generated/prisma/enums"
import type { DbClient } from "./types"

export type SelfServiceStoreDetectionInput = {
  accuracyMeters?: number | null
  latitude: number
  longitude: number
  maxCandidates?: number
}

export type SelfServiceStoreDetectionCandidate = {
  confidence: number
  distanceMeters: number
  radiusMeters: number
  store: {
    id: string
    name: string
    slug: string
  }
  tenant: {
    id: string
    name: string
    slug: string
  }
}

export type SelfServiceStoreDetectionResult = {
  candidates: SelfServiceStoreDetectionCandidate[]
  match: SelfServiceStoreDetectionCandidate | null
  status: "confirmed" | "manual_required" | "needs_confirmation"
}

type StoreDetectionRow = {
  id: string
  metadata: Prisma.JsonValue | null
  name: string
  slug: string
  tenant: {
    id: string
    name: string
    slug: string
  }
}

type StoreDetectionConfig = {
  latitude: number
  longitude: number
  radiusMeters: number
}

const EARTH_RADIUS_METERS = 6_371_000
const DEFAULT_RADIUS_METERS = 80
const HIGH_CONFIDENCE_THRESHOLD = 0.82
const MAX_AUTO_CONFIRM_ACCURACY_METERS = 120
const MAX_QUERY_LIMIT = 50

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return null

  const parsed = Number(value.trim())

  return Number.isFinite(parsed) ? parsed : null
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

export function getDistanceMeters(input: {
  fromLatitude: number
  fromLongitude: number
  toLatitude: number
  toLongitude: number
}) {
  const fromLatitude = toRadians(input.fromLatitude)
  const toLatitude = toRadians(input.toLatitude)
  const latitudeDelta = toRadians(input.toLatitude - input.fromLatitude)
  const longitudeDelta = toRadians(input.toLongitude - input.fromLongitude)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2

  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  )
}

function getSelfServiceDetectionConfig(
  metadata: Prisma.JsonValue | null,
): StoreDetectionConfig | null {
  const root = asRecord(metadata)
  const retailOps = asRecord(root.retailOps)
  const selfServiceDetection = asRecord(retailOps.selfServiceDetection)
  const legacySelfService = asRecord(root.selfServiceStoreDetection)
  const source =
    Object.keys(selfServiceDetection).length > 0
      ? selfServiceDetection
      : legacySelfService
  const location = asRecord(source.location)
  const enabled =
    source.enabled === true ||
    source.isEnabled === true ||
    location.enabled === true
  const latitude = readNumber(source.latitude ?? location.latitude)
  const longitude = readNumber(source.longitude ?? location.longitude)

  if (!enabled || latitude === null || longitude === null) return null

  const radiusMeters =
    readNumber(source.radiusMeters ?? location.radiusMeters) ??
    DEFAULT_RADIUS_METERS

  return {
    latitude,
    longitude,
    radiusMeters: clamp(radiusMeters, 10, 5_000),
  }
}

function toCandidate(
  row: StoreDetectionRow,
  input: SelfServiceStoreDetectionInput,
) {
  const config = getSelfServiceDetectionConfig(row.metadata)

  if (!config) return null

  const distanceMeters = getDistanceMeters({
    fromLatitude: input.latitude,
    fromLongitude: input.longitude,
    toLatitude: config.latitude,
    toLongitude: config.longitude,
  })
  const accuracyMeters = Math.max(0, input.accuracyMeters ?? 0)
  const confidenceRadius = config.radiusMeters + Math.min(accuracyMeters, 250)
  const confidence = clamp(1 - distanceMeters / confidenceRadius, 0, 1)

  if (confidence <= 0) return null

  return {
    confidence: Number(confidence.toFixed(3)),
    distanceMeters: Math.round(distanceMeters),
    radiusMeters: config.radiusMeters,
    store: {
      id: row.id,
      name: row.name,
      slug: row.slug,
    },
    tenant: row.tenant,
  } satisfies SelfServiceStoreDetectionCandidate
}

export async function resolveSelfServiceStoreFromCoordinates(
  db: DbClient,
  input: SelfServiceStoreDetectionInput,
): Promise<SelfServiceStoreDetectionResult> {
  const maxCandidates = clamp(input.maxCandidates ?? 5, 1, 10)
  const rows = (await db.store.findMany({
    where: {
      status: StoreStatus.ACTIVE,
      tenant: {
        isActive: true,
      },
    },
    select: {
      id: true,
      metadata: true,
      name: true,
      slug: true,
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    take: MAX_QUERY_LIMIT,
  })) as StoreDetectionRow[]
  const candidates = rows
    .flatMap((row) => {
      const candidate = toCandidate(row, input)

      return candidate ? [candidate] : []
    })
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        left.distanceMeters - right.distanceMeters,
    )
    .slice(0, maxCandidates)
  const match = candidates[0] ?? null

  if (!match) {
    return {
      candidates,
      match: null,
      status: "manual_required",
    }
  }

  const isInsideStoreRadius = match.distanceMeters <= match.radiusMeters
  const hasAccurateLocation =
    (input.accuracyMeters ?? MAX_AUTO_CONFIRM_ACCURACY_METERS) <=
    MAX_AUTO_CONFIRM_ACCURACY_METERS

  return {
    candidates,
    match,
    status:
      match.confidence >= HIGH_CONFIDENCE_THRESHOLD &&
      isInsideStoreRadius &&
      hasAccurateLocation
        ? "confirmed"
        : "needs_confirmation",
  }
}
