"use client"

let lastFrame: HTMLIFrameElement | null = null

/**
 * Prints a PDF (blob or same-origin URL) from a hidden frame. Browsers that
 * keep their PDF viewer out of reach (Safari, Firefox) open it in a new tab
 * instead; `onBlocked` runs when that tab was blocked too.
 */
export function printPdf(
  url: string,
  { title, onBlocked }: { title: string; onBlocked?: () => void },
) {
  lastFrame?.remove()
  const frame = document.createElement("iframe")
  frame.title = title
  frame.className = "fixed right-0 bottom-0 size-0 border-0 opacity-0"
  frame.src = url
  frame.onload = () => {
    try {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    } catch {
      if (!window.open(url, "_blank")) onBlocked?.()
    }
  }
  document.body.append(frame)
  lastFrame = frame
}

/** Removes the last print frame, e.g. when its sheet closes. */
export function removePrintFrame() {
  lastFrame?.remove()
  lastFrame = null
}
