import type { ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server.browser"

export function renderEmailMarkup(email: ReactElement) {
  return `<!doctype html>${renderToStaticMarkup(email)}`
}
