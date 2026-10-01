import { expect, test } from "bun:test"
import { LEGAL_DOCUMENTS } from "@ewatrade/utils/legal-documents"
import { renderToStaticMarkup } from "react-dom/server"
import { LegalDocumentPage } from "./legal-document-page"

test("Production renders a pending legal page without draft policy sections", () => {
  const previous = process.env.APP_ENV
  process.env.APP_ENV = "production"
  try {
    const html = renderToStaticMarkup(<LegalDocumentPage documentKey="terms" />)
    expect(html).toContain("Terms of Service")
    expect(html).toContain("has not been published")
    expect(html).not.toContain(LEGAL_DOCUMENTS.terms.sections[0]?.text ?? "")
    expect(html).not.toContain("2026-09-24-draft-1")
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, "APP_ENV")
    else process.env.APP_ENV = previous
  }
})
