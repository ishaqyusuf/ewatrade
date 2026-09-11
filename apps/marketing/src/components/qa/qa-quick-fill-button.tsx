"use client"

type QaQuickFillButtonProps = {
  canUndo?: boolean
  label?: string
  onFill: () => void
  onUndo?: () => void
  qaDomain?: string | null
  visible?: boolean
}

export function QaQuickFillButton({
  canUndo,
  label = "Quick Fill",
  onFill,
  onUndo,
  qaDomain,
  visible = true,
}: QaQuickFillButtonProps) {
  if (!visible) return null

  return (
    <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-2xl border border-primary/20 bg-background/95 p-1.5 shadow-xl backdrop-blur">
      {canUndo && onUndo ? (
        <button
          className="min-h-10 rounded-xl px-3 text-xs font-bold text-muted-foreground hover:bg-muted"
          onClick={onUndo}
          type="button"
        >
          Undo
        </button>
      ) : null}
      <button
        aria-label={`${label} using ${qaDomain ?? "the active QA Domain"}`}
        className="min-h-10 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground hover:brightness-95"
        onClick={onFill}
        type="button"
      >
        {label}
        <span className="ml-2 rounded bg-primary-foreground/15 px-1.5 py-0.5 text-[9px] font-black uppercase">
          QA
        </span>
      </button>
    </div>
  )
}
