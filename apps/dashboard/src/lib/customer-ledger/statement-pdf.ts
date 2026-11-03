export {
  STATEMENT_PDF_PRESETS,
  type StatementPdfPreset,
  localDay,
  statementPdfRange,
} from "@ewatrade/order-receipts/statement"

export function pdfBytes(base64: string) {
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}
