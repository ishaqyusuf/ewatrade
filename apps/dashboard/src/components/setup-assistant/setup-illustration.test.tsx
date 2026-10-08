import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SetupDraftCard } from "./setup-draft-card"
import type { SetupDraftEntity } from "./setup-format"

function card(payload: Record<string, unknown>, state = "PROPOSED") {
  const entity = {
    key: "k",
    kind: payload.kind === "service" ? "SERVICE" : "PRODUCT",
    state,
    payload,
    openQuestions: [],
  } as SetupDraftEntity
  return renderToStaticMarkup(
    <SetupDraftCard
      entity={entity}
      currencyCode="NGN"
      pending={false}
      onSave={() => {}}
      onState={() => {}}
    />,
  )
}

const eggs = {
  kind: "product",
  name: "Crate of eggs",
  unitName: "Crate",
  priceMinor: 450_000,
}

test("a recommended picture shows on the card and can be changed or removed", () => {
  const markup = card({ ...eggs, illustrationId: "ill-egg" })
  expect(markup).toContain("Picture: ")
  expect(markup).toContain('aria-label="Change the picture for Crate of eggs"')
  expect(markup).toContain('aria-label="Remove the picture for Crate of eggs"')
  expect(markup).toContain("<svg")
})

test("without a picture the owner can choose one; services too", () => {
  for (const markup of [
    card({ ...eggs, illustrationId: null }),
    card({ kind: "service", name: "Shirt wash", pricing: "quote" }),
  ]) {
    expect(markup).toContain("No picture")
    expect(markup).toContain("Choose a picture")
    expect(markup).not.toContain("Remove the picture")
  }
})

test("a sent photo replaces the picture, and added records are fixed", () => {
  const photo = card({
    ...eggs,
    illustrationId: "ill-egg",
    photoAttachmentId: "att_1",
  })
  expect(photo).not.toContain("Picture: ")
  expect(photo).not.toContain("Choose a picture")
  const added = card({ ...eggs, illustrationId: "ill-egg" }, "COMMITTED")
  expect(added).not.toContain("Change the picture")
  expect(added).toContain("<svg")
})
