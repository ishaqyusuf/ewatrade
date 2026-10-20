export function StaffDirectoryReadEmpty({
  filtered,
  continued,
}: { filtered: boolean; continued: boolean }) {
  return (
    <div className="grid gap-2 py-6 text-sm">
      <p>
        {continued
          ? "No memberships remain after this cursor."
          : filtered
            ? "No memberships match these filters."
            : "No memberships are available in this business directory."}
      </p>
      <p className="text-xs text-muted-foreground">
        {continued
          ? "Return to the first page or refresh; pages reflect current request snapshots."
          : filtered
            ? "Clear or change filters to view other current membership records."
            : "This directory does not reconstruct past staff history."}
      </p>
    </div>
  )
}
