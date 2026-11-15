"use client"

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ewatrade/ui"
import {
  Copy01Icon,
  Download04Icon,
  Share08Icon,
  Tick02Icon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import QRCode from "qrcode"
import { useEffect, useState, useSyncExternalStore } from "react"

/** Web Share only where it opens the phone's share sheet. */
export function useCanShare() {
  return useSyncExternalStore(
    () => () => {},
    () =>
      typeof navigator.share === "function" &&
      window.matchMedia("(pointer: coarse)").matches,
    () => false,
  )
}

/** Copies the link and says so for a moment. */
export function useCopyLink(url: string) {
  const [copied, setCopied] = useState(false)
  const [problem, setProblem] = useState("")
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2500)
    return () => clearTimeout(timer)
  }, [copied])
  return {
    copied,
    problem,
    copy: async () => {
      try {
        await navigator.clipboard.writeText(url)
        setProblem("")
        setCopied(true)
      } catch {
        setProblem("Couldn’t copy. Press and hold the link to copy it.")
      }
    },
  }
}

/**
 * Share your store (Midday share = modal): the link with Copy, WhatsApp,
 * the phone's share sheet, and a QR code to print for the counter.
 */
export function StoreShareDialog({
  open,
  onOpenChange,
  businessName,
  url,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  businessName: string
  url: string
}) {
  const canShare = useCanShare()
  const { copied, copy, problem } = useCopyLink(url)
  const [qr, setQr] = useState("")
  useEffect(() => {
    if (!open || qr) return
    let active = true
    void QRCode.toDataURL(url, { margin: 1, width: 480 }).then((value) => {
      if (active) setQr(value)
    })
    return () => {
      active = false
    }
  }, [open, qr, url])
  const message = `Shop at ${businessName}: ${url}`
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100svh-2rem)] content-start gap-5 overflow-y-auto rounded-[var(--ui-radius-surface)] p-6 sm:max-w-md">
        <DialogHeader className="pr-10">
          <DialogTitle>Share your store</DialogTitle>
          <DialogDescription className="sr-only">
            Send your store link or print its QR code.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 items-center gap-2 rounded-[var(--ui-radius-control)] border border-border bg-[var(--canvas)] py-1 pr-1 pl-4">
          <span className="min-w-0 flex-1 truncate text-sm" title={url}>
            {url.replace(/^https:\/\//, "")}
          </span>
          <Button variant="outline" onClick={() => void copy()}>
            <HugeiconsIcon
              icon={copied ? Tick02Icon : Copy01Icon}
              data-icon="inline-start"
            />
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <div className="grid gap-2">
          {canShare ? (
            <Button
              onClick={async () => {
                try {
                  await navigator.share({ title: businessName, text: message })
                } catch {
                  // Closing the share sheet is not an error.
                }
              }}
            >
              <HugeiconsIcon icon={Share08Icon} data-icon="inline-start" />
              Share
            </Button>
          ) : null}
          <Button
            variant={canShare ? "outline" : "default"}
            render={
              <a
                aria-label="Send on WhatsApp"
                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <HugeiconsIcon icon={WhatsappIcon} data-icon="inline-start" />
            Send on WhatsApp
          </Button>
        </div>
        <div className="grid justify-items-center gap-3 border-t border-border pt-5">
          {qr ? (
            <img
              alt={`QR code for ${businessName}'s online store`}
              className="size-44 rounded-[var(--ui-radius-item)] bg-white p-2"
              src={qr}
            />
          ) : (
            <div className="size-44 animate-pulse rounded-[var(--ui-radius-item)] bg-muted" />
          )}
          <Button
            variant="outline"
            disabled={!qr}
            onClick={() => {
              const anchor = document.createElement("a")
              anchor.download = "online-store-qr.png"
              anchor.href = qr
              anchor.click()
            }}
          >
            <HugeiconsIcon icon={Download04Icon} data-icon="inline-start" />
            Download QR code
          </Button>
        </div>
        <output
          aria-live="polite"
          className="block text-sm text-destructive empty:hidden"
        >
          {problem}
        </output>
      </DialogContent>
    </Dialog>
  )
}
