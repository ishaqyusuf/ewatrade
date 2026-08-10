"use client"

import { Button } from "@ewatrade/ui"
import { useState } from "react"
import { QrCodeCard } from "./qr-code-card"
import type { CustomerChannelWorkspace } from "./types"

export function EntryPointCard({
  canManage,
  entryPoint,
  isPending,
  onPublish,
  onRevoke,
  readiness,
  team,
}: {
  canManage: boolean
  entryPoint: CustomerChannelWorkspace["entryPoint"]
  isPending: boolean
  onPublish: () => void
  onRevoke: () => void
  readiness: CustomerChannelWorkspace["readiness"]
  team: CustomerChannelWorkspace["team"]
}) {
  const [copied, setCopied] = useState(false)
  const storefront =
    process.env.NEXT_PUBLIC_STOREFRONT_URL?.replace(/\/$/, "") ?? ""
  const url = entryPoint?.entryToken
    ? `${storefront}/r/${entryPoint.entryToken}`
    : ""
  const published = entryPoint?.status === "published"

  const copy = async () => {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2_000)
  }

  return (
    <section className="grid gap-5 rounded-xl border border-border bg-card p-5 lg:grid-cols-[1fr_auto]">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Publish
        </p>
        <h2 className="font-semibold">Share link & QR</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          This Store link stays the same when a phone number or provider
          changes. The QR contains only an opaque EwaTrade entry token.
        </p>
        <div className="mt-4 grid gap-2 text-sm">
          <Requirement
            label="Active attendant"
            ready={team.some((member) => member.status === "active")}
          />
          <Requirement
            label="Web channel"
            ready={readiness.web.readiness === "available"}
          />
          <Requirement
            label="WhatsApp channel"
            ready={readiness.whatsapp.readiness === "available"}
          />
          <p className="text-xs text-muted-foreground">
            Server policy decides publication. The indicators above are the
            current readiness projection, not client-side authorization.
          </p>
        </div>

        {published && url ? (
          <div className="mt-5 grid gap-3">
            <a
              className="break-all rounded-lg bg-muted px-4 py-3 text-sm text-primary underline"
              href={url}
              rel="noreferrer"
              target="_blank"
            >
              {url}
            </a>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void copy()} type="button">
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button
                disabled={!canManage || isPending}
                onClick={onRevoke}
                type="button"
                variant="outline"
              >
                Revoke link
              </Button>
            </div>
          </div>
        ) : (
          <Button
            className="mt-5"
            disabled={!canManage || isPending}
            onClick={onPublish}
            type="button"
          >
            {isPending ? "Publishing…" : "Publish customer entry point"}
          </Button>
        )}
      </div>
      {published && url ? <QrCodeCard url={url} /> : null}
    </section>
  )
}

function Requirement({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${ready ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
      />
      <span>{label}</span>
      <span className="text-xs text-muted-foreground">
        {ready ? "Ready" : "Not ready"}
      </span>
    </div>
  )
}
