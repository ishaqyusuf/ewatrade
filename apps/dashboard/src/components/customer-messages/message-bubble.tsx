import { cn } from "@ewatrade/ui"

/** The customer's view of the text; plain text only, newlines kept. */
export function MessageBubble({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-2xl rounded-tr-sm border border-emerald-600/15 bg-emerald-50 px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words text-emerald-950 dark:border-emerald-400/15 dark:bg-emerald-950/40 dark:text-emerald-50",
        className,
      )}
    >
      {text}
    </div>
  )
}
