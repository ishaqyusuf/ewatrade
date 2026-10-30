import { readPerformancePhases } from "./qa-web-performance.mjs"

/**
 * Two isolated reads outside page timing windows. A fixed seven-day UTC window
 * diagnoses the list procedure, not the UI's timezone/date-filter behavior.
 * @param {import("playwright").Page} page
 * @param {string} origin
 */
export async function diagnoseActivityReads(page, origin) {
  if (origin !== "https://ewatrade-dashboard.localhost")
    throw Error("Activity read diagnostics are local-only.")
  try {
    const results = await page.evaluate(async () => {
      const to = new Date()
      const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000)
      /** @param {"activity.filters" | "activity.listPage"} procedure */
      const read = async (procedure) => {
        const input =
          procedure === "activity.filters"
            ? {}
            : {
                from: from.toISOString(),
                to: to.toISOString(),
                limit: 25,
              }
        const started = performance.now()
        const response = await fetch(
          `/api/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`,
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            redirect: "error",
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(15_000),
          },
        )
        const body = await response.text()
        if (!response.ok) throw Error("Activity diagnostic read refused.")
        const data = JSON.parse(body)?.result?.data?.json
        if (procedure === "activity.filters") {
          if (
            !Array.isArray(data?.actors) ||
            data.actors.length > 25 ||
            !Array.isArray(data.types)
          )
            throw Error("Activity choices are invalid.")
        } else if (
          !Array.isArray(data?.items) ||
          data.items.length > 25 ||
          !Number.isSafeInteger(data.total) ||
          data.total < 0
        )
          throw Error("Activity page is invalid.")
        return {
          procedure,
          milliseconds: Math.round(performance.now() - started),
          status: response.status,
          decodedBodyBytes: new TextEncoder().encode(body).byteLength,
          timing: response.headers.get("server-timing") ?? "",
        }
      }
      return [await read("activity.filters"), await read("activity.listPage")]
    })
    return results.map(({ timing, ...facts }) => {
      const serverPhases = readPerformancePhases(timing)
      const total =
        facts.procedure === "activity.filters"
          ? "activityFilters"
          : "activityList"
      const projection =
        facts.procedure === "activity.filters"
          ? "activityFilterSql"
          : "activityPageSql"
      for (const phase of [
        total,
        projection,
        "activityAdmission",
        "activityStores",
      ])
        if (serverPhases[phase]?.count !== 1)
          throw Error("Current Activity timing is unavailable.")
      if ((serverPhases.transactionSql?.count ?? 0) < 3)
        throw Error("Transaction timing is unavailable.")
      return { ...facts, serverPhases }
    })
  } catch {
    throw Error(
      "Isolated Activity read diagnostics did not complete; current tracing is required.",
    )
  }
}
