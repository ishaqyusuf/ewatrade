/**
 * Where the business-type step puts its confirm: a single pick opens the
 * "Your business type" sheet, except "Other", which needs a typed
 * description, so it stays on the page with Continue in the search footer
 * (sheets take no typing). Several picks also continue from the footer.
 */
export function ownerTypePickPresentation({
  multi,
  selected,
}: {
  multi: boolean
  selected: readonly string[]
}) {
  const otherOnPage = !multi && selected.includes("other")
  return {
    otherOnPage,
    sheet: !multi && selected.length > 0 && !otherOnPage,
    continueInFooter: (multi && selected.length > 0) || otherOnPage,
  }
}
