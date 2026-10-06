"use client"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
  Skeleton,
} from "@ewatrade/ui"
import type { Row, Table } from "@tanstack/react-table"
import type { ReactNode } from "react"
import { RowSelectCheckbox, SelectAllCheckbox } from "./selection"

export type CollectionView = "list" | "cards"

export type DirectoryRecordDetail = {
  label: string
  value: ReactNode
}

/** Count line plus, outside Table view, a select-all for the loaded rows. */
export function DirectoryToolbar<TData>({
  table,
  view,
  selectAllLabel,
  disabled = false,
  summary,
  children,
}: {
  table: Table<TData>
  view: CollectionView | "table"
  selectAllLabel: string
  disabled?: boolean
  summary: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {view !== "table" ? (
          <div className="flex items-center gap-2 text-sm">
            <SelectAllCheckbox
              table={table}
              label={selectAllLabel}
              disabled={disabled}
            />
            Select all
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {summary}
        </p>
      </div>
      {children ? (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </div>
  )
}

export function DirectoryCollection({
  view,
  label,
  children,
}: {
  view: CollectionView
  label: string
  children: ReactNode
}) {
  return view === "cards" ? (
    <ul
      aria-label={`${label} cards`}
      className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      {children}
    </ul>
  ) : (
    <ItemGroup aria-label={`${label} list`}>{children}</ItemGroup>
  )
}

export function DirectoryCollectionSkeleton({ label }: { label: string }) {
  return (
    <div aria-label={`Loading ${label}`} className="flex flex-col gap-3">
      {["first", "second", "third"].map((key) => (
        <Skeleton key={key} className="h-24 w-full" />
      ))}
    </div>
  )
}

function RecordDetails({ details }: { details: DirectoryRecordDetail[] }) {
  if (!details.length) return null
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      {details.map((detail) => (
        <div key={detail.label} className="min-w-0">
          <dt className="text-muted-foreground">{detail.label}</dt>
          <dd className="break-words">{detail.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * One selectable record as a shadcn Item (list) or Card (cards). `onOpen`
 * turns the title into the record's primary navigation control.
 */
export function DirectoryRecord<TData>({
  row,
  view,
  selectLabel,
  media,
  title,
  description,
  badges,
  highlight,
  details = [],
  actions,
  onOpen,
}: {
  row: Row<TData>
  view: CollectionView
  selectLabel: string
  /** Optional thumbnail or icon shown beside the title. */
  media?: ReactNode
  title: ReactNode
  description?: ReactNode
  badges?: ReactNode
  /** The one figure that drives action (e.g. a balance), shown right-aligned. */
  highlight?: DirectoryRecordDetail
  details?: DirectoryRecordDetail[]
  actions?: ReactNode
  onOpen?: () => void
}) {
  const selected = row.getIsSelected() ? "selected" : undefined
  const checkbox = <RowSelectCheckbox row={row} label={selectLabel} />
  const heading = onOpen ? (
    <button
      type="button"
      className="min-w-0 text-left underline-offset-4 outline-none hover:underline focus-visible:underline"
      onClick={onOpen}
    >
      {title}
    </button>
  ) : (
    title
  )
  const badgeRow = badges ? (
    <div className="flex flex-wrap gap-2">{badges}</div>
  ) : null
  const headline = highlight ? (
    <div className="ml-auto shrink-0 text-right">
      <p className="text-xs text-muted-foreground">{highlight.label}</p>
      <p className="text-lg font-semibold tabular-nums">{highlight.value}</p>
    </div>
  ) : null

  if (view === "cards")
    return (
      <li className="min-w-0">
        <Card data-state={selected} size="sm" className="h-full min-w-0">
          <CardHeader>
            <CardTitle className="flex min-w-0 items-center gap-3 break-words">
              {media ? <span className="shrink-0">{media}</span> : null}
              <span className="min-w-0">{heading}</span>
            </CardTitle>
            {description ? (
              <CardDescription className="min-w-0 break-all">
                {description}
              </CardDescription>
            ) : null}
            <CardAction>{checkbox}</CardAction>
          </CardHeader>
          {badgeRow || headline || details.length ? (
            <CardContent className="flex flex-col gap-4">
              {badgeRow || headline ? (
                <div className="flex flex-wrap items-end gap-3">
                  {badgeRow}
                  {headline}
                </div>
              ) : null}
              <RecordDetails details={details} />
            </CardContent>
          ) : null}
          {actions ? (
            <CardFooter className="mt-auto flex-wrap">{actions}</CardFooter>
          ) : null}
        </Card>
      </li>
    )

  return (
    <Item render={<li />} variant="outline" data-state={selected}>
      <ItemMedia>{checkbox}</ItemMedia>
      {media ? <ItemMedia>{media}</ItemMedia> : null}
      <ItemContent className="min-w-0 basis-48">
        <ItemTitle className="max-w-full break-words">{heading}</ItemTitle>
        {description ? (
          <ItemDescription className="break-all">{description}</ItemDescription>
        ) : null}
        {badgeRow}
      </ItemContent>
      <RecordDetails details={details} />
      {headline}
      {actions ? (
        <ItemActions className="flex-wrap">{actions}</ItemActions>
      ) : null}
    </Item>
  )
}
