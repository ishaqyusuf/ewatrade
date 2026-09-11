type TextDetail = {
  label: string
  value?: string | null
}

export function createEmailText(input: {
  cta?: { href: string; label: string }
  details?: TextDetail[]
  intro: string
  note?: string
  title: string
}) {
  return [
    input.title,
    "",
    input.intro,
    ...(input.details ?? []).flatMap((detail) =>
      detail.value ? [`${detail.label}: ${detail.value}`] : [],
    ),
    ...(input.cta ? ["", `${input.cta.label}: ${input.cta.href}`] : []),
    ...(input.note ? ["", input.note] : []),
  ]
    .filter((line) => line !== null)
    .join("\n")
}
