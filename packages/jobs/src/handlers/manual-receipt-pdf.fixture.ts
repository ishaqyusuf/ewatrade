/** Fully owned PDF with correct xref, standard font and no private/customer data. */
export function ownedReceiptPdf(count = 1, width = 300, height = 400) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${count} /Kids [${Array.from({ length: count }, (_, index) => `${4 + index * 2} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  for (let index = 0; index < count; index++) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
    )
    const content = `BT /F1 18 Tf 30 150 Td (Owned QA transfer ${index + 1}: NGN 100.00) Tj ET`
    objects.push(
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    )
  }
  let text = "%PDF-1.7\n"
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(text.length)
    text += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const start = text.length
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  text += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")
  text += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${start}\n%%EOF\n`
  return new TextEncoder().encode(text)
}
