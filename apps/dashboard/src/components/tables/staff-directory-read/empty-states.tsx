export function StaffDirectoryReadEmpty({
  filtered,
  continued,
}: { filtered: boolean; continued: boolean }) {
  const hint = continued
    ? "Go back to the first page."
    : filtered
      ? "Try other filters."
      : null
  return (
    <div className="grid gap-2 py-6 text-sm">
      <p>
        {continued
          ? "No more staff."
          : filtered
            ? "No staff match these filters."
            : "No staff yet."}
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
