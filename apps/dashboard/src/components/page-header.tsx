import type { ReactNode } from "react"

export function PageHeader({
  children,
  description,
  eyebrow,
  title,
}: {
  children?: ReactNode
  description?: string
  eyebrow?: string
  title: string
}) {
  return (
    <header className="grid min-w-0 gap-4">
      <div>
        {eyebrow ? (
          <p className="text-sm text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </header>
  )
}

export function PageToolbar({
  actions,
  children,
}: {
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      {children ? <div className="min-w-0 flex-1">{children}</div> : null}
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
