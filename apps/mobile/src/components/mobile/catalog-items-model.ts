export function shouldShowCatalogFirstItemGate({
  hasCatalogItems,
  isError,
  isPending,
  presentation,
  rowCount,
}: {
  hasCatalogItems?: boolean
  isError: boolean
  isPending: boolean
  presentation: "modal" | "tab"
  rowCount: number
}) {
  return (
    presentation === "tab" &&
    hasCatalogItems === false &&
    !isPending &&
    !isError &&
    rowCount === 0
  )
}
