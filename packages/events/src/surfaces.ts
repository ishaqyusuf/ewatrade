export const webSurfaces = {
  dashboard: {
    project: "ewatrade-dashboard",
    origins: ["https://dash.ewatrade.com"],
  },
  marketing: {
    project: "ewatrade-marketing",
    origins: ["https://ewatrade.com", "https://www.ewatrade.com"],
  },
} as const
export type WebSurface = keyof typeof webSurfaces
