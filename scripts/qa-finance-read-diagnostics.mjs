import { readPerformancePhases } from "./qa-web-performance.mjs"

/**
 * Two isolated, existing-data GETs outside page timing windows. Only fixed labels,
 * status/elapsed/decoded-byte counts and allowlisted phase numbers leave the page.
 * @param {import("playwright").Page} page
 * @param {string} origin
 */
export async function diagnoseFinanceReads(page, origin) {
  if (origin !== "https://ewatrade-dashboard.localhost")
    throw Error("Finance read diagnostics are local-only.")
  try {
    const results = await page.evaluate(async () => {
      /** @param {string} path @param {unknown} [input] */
      const read = async (path, input) => {
        const query = input
          ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
          : ""
        const started = performance.now()
        const response = await fetch(`/api/trpc/${path}${query}`, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        })
        const body = await response.text()
        if (!response.ok) throw Error("Finance diagnostic read refused.")
        const data = JSON.parse(body)?.result?.data?.json
        return {
          data,
          facts: {
            procedure: path,
            milliseconds: Math.round(performance.now() - started),
            status: response.status,
            decodedBodyBytes: new TextEncoder().encode(body).byteLength,
            timing: response.headers.get("server-timing") ?? "",
          },
        }
      }
      const book = await read("finance.book")
      if (
        typeof book.data?.id !== "string" ||
        !book.data.id ||
        book.data.id.length > 128 ||
        typeof book.data.currencyCode !== "string" ||
        !/^[A-Z]{3}$/.test(book.data.currencyCode)
      )
        throw Error("Existing Finance Book is required.")
      const owed = await read("finance.owedSummary", {
        currentCurrency: book.data.currencyCode,
      })
      if (owed.data?.resolvedBookId !== book.data.id)
        throw Error("Current Finance Book changed.")
      for (const party of [owed.data?.customers, owed.data?.suppliers]) {
        if (
          !party ||
          !Number.isSafeInteger(party.count) ||
          party.count < 0 ||
          typeof party.owedMinor !== "string" ||
          !/^\d+$/.test(party.owedMinor) ||
          !Array.isArray(party.top) ||
          party.top.length > 3 ||
          party.top.some(
            (/** @type {unknown} */ row) =>
              !row ||
              typeof row !== "object" ||
              !("id" in row) ||
              typeof row.id !== "string" ||
              !("name" in row) ||
              typeof row.name !== "string" ||
              !("owedMinor" in row) ||
              typeof row.owedMinor !== "string" ||
              !/^\d+$/.test(row.owedMinor),
          )
        )
          throw Error("Finance summary shape is invalid.")
      }
      return [book.facts, owed.facts]
    })
    return results.map(({ timing, ...facts }) => ({
      ...facts,
      serverPhases: readPerformancePhases(timing),
    }))
  } catch {
    throw Error("Isolated Finance read diagnostics did not complete.")
  }
}
