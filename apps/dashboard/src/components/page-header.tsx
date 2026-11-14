import { PageTitleHeading } from "@/components/dashboard/page-title"
import type { ReactNode } from "react"

/**
 * Page title block. Inside the shell the top bar is the page's only `<h1>`,
 * so the title (and its eyebrow) hides on a section's own page and becomes an
 * `<h2>` on deeper pages; the description and children stay.
 */
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
      <div className="empty:hidden">
        <PageTitleHeading
          title={title}
          eyebrow={
            eyebrow ? (
              <p className="text-sm text-muted-foreground">{eyebrow}</p>
            ) : null
          }
        />
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground first:mt-0">
            {description}
          </p>
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
