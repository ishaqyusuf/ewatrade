/** Only stable browsing routes can resume. Forms/commands are deliberately excluded. */
export const APP_UPDATE_RESUME_ROUTES = [
  "/dashboard",
  "/catalog",
  "/orders",
  "/inventory",
  "/more",
  "/updates",
]
export const canInstallBuildFromRoute = (route: string) =>
  APP_UPDATE_RESUME_ROUTES.includes(route) ||
  route === "/" ||
  route === "/login"
export type AppUpdateResume = {
  schemaVersion: 1
  route: string
  userId: string
  businessId: string | null
  storeId: string | null
  targetBuild: number
  savedAt: number
}
export function getAppUpdateResume(
  value: unknown,
  current: {
    userId: string
    businessId: string | null
    storeId: string | null
    buildNumber: number
    now: number
  },
): string | null {
  if (!value || typeof value !== "object") return null
  const snapshot = value as AppUpdateResume
  return snapshot.schemaVersion === 1 &&
    APP_UPDATE_RESUME_ROUTES.includes(snapshot.route) &&
    snapshot.userId === current.userId &&
    snapshot.businessId === current.businessId &&
    snapshot.storeId === current.storeId &&
    snapshot.targetBuild === current.buildNumber &&
    Number.isFinite(snapshot.savedAt) &&
    current.now >= snapshot.savedAt &&
    current.now - snapshot.savedAt < 86400000
    ? snapshot.route
    : null
}
