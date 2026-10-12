/** Atomic object handoff; assistant/chat and unrelated URL keys are untouched. */
export function businessReportOriginalParams(target: {
  kind: "catalog_item" | "customer"
  id: string
}) {
  return target.kind === "catalog_item"
    ? {
        businessReport: null,
        catalogDetail: target.id,
        catalogDetailTab: null,
        catalogActivity: null,
        customerDetail: null,
      }
    : {
        businessReport: null,
        catalogDetail: null,
        catalogDetailTab: null,
        catalogActivity: null,
        customerDetail: target.id,
      }
}
