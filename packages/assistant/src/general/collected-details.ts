/** Numbering is optional presentation; leave exact amounts and ordinary text intact. */
export function collectedDetailsText(text: string) {
  return text.replace(/^[\t ]*\d+[.)][\t ]+(?=[\p{L}])/gmu, "")
}
