import { z } from "zod"
import { tableIds } from "./table-settings"

export const directoryViews = ["table", "list", "cards"] as const
export type DirectoryView = (typeof directoryViews)[number]
export const directoryPageIds = [
  ...tableIds,
  "customer-accounts",
  "finance-accounts",
  "stores",
] as const
export type DirectoryPageId = (typeof directoryPageIds)[number]
export type FinanceDirectoryPageId = Extract<
  DirectoryPageId,
  | "expenses"
  | "finance-accounts"
  | "finance-bank-statements"
  | "finance-suppliers"
>
export type DirectoryViewSettingsById<Id extends DirectoryPageId> = Partial<
  Record<Id, DirectoryViewSettings>
>
export type DirectoryViewSettings = {
  view: DirectoryView | null
  scope: string
}

export const directoryViewInputSchema = z
  .object({
    pageId: z.enum(directoryPageIds),
    scope: z.string().regex(/^[a-f0-9]{24}$/),
    view: z.enum(directoryViews),
  })
  .strict()

export function parseSavedDirectoryView(value: unknown): DirectoryView | null {
  return directoryViews.find((view) => view === value) ?? null
}

export function getDirectoryViewCookie(pageId: DirectoryPageId, scope: string) {
  return `directory-view-${scope}-${pageId}`
}

export function resolveDirectoryView({
  urlView,
  savedView,
  smallScreen,
  options,
}: {
  urlView: DirectoryView | null
  savedView: DirectoryView | null
  smallScreen: boolean
  options: readonly [DirectoryView, ...DirectoryView[]]
}): DirectoryView {
  if (urlView && options.includes(urlView)) return urlView
  if (savedView && options.includes(savedView)) return savedView
  const preferred: readonly DirectoryView[] = smallScreen
    ? ["list", "cards", "table"]
    : ["table", "list", "cards"]
  return preferred.find((view) => options.includes(view)) ?? options[0]
}
