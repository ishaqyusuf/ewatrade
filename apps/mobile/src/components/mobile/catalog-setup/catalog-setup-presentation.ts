// Shared form composition keeps its native layout while each appearance owns color.
const marketClasses: Record<string, string> = {
  "text-foreground": "text-market-ink",
  "text-muted-foreground": "text-market-muted-ink",
  "text-primary": "text-market-accent-ink",
  "text-primary-foreground": "text-market-on-palm",
  "bg-background": "bg-market-canvas",
  "bg-card": "bg-market-field",
  "bg-muted": "bg-market-field",
  "bg-muted/60": "bg-market-field",
  "bg-primary": "bg-market-palm",
  "border-border": "border-market-line",
  "border-primary": "border-market-palm",
  "active:bg-muted": "active:bg-market-soft-band",
  "active:bg-accent": "active:bg-market-soft-band",
}

export function catalogSetupClassName(value: string, market: boolean) {
  if (!market) return value
  return value
    .split(" ")
    .map((token) => marketClasses[token] ?? token)
    .join(" ")
}
