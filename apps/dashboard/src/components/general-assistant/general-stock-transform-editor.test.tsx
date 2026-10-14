import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  GeneralStockTransformEditor,
  editedTransform,
} from "./general-stock-transform-editor"

// Source/unit evidence only: static render and the save path's validation.
const draft = {
  action: "stock_package_transform" as const,
  sourceBalanceSourceId: "crate-balance",
  targetBalanceSourceId: "piece-balance",
  sourceQuantity: "2",
  reason: "Open two crates",
}

test("the editor offers quantity and reason only; endpoints stay as drafted", () => {
  const html = renderToStaticMarkup(
    <GeneralStockTransformEditor
      initial={draft}
      disabled={false}
      onSave={() => {}}
      onCancel={() => {}}
    />,
  )
  expect(html).toContain('id="transform-quantity"')
  expect(html).toContain('id="transform-reason"')
  expect(html).not.toContain("crate-balance")
  expect(html).not.toContain("piece-balance")
  expect(html).not.toContain("target quantity")
})

test("saving keeps both exact balances and refuses invalid edits", () => {
  const saved = editedTransform(draft, {
    sourceQuantity: "3",
    reason: "Open three",
  })
  expect(saved).toEqual({
    ok: true,
    payload: { ...draft, sourceQuantity: "3", reason: "Open three" },
  })
  for (const edits of [
    { sourceQuantity: "0", reason: "x" },
    { sourceQuantity: "-1", reason: "x" },
    { sourceQuantity: "abc", reason: "x" },
    { sourceQuantity: "1", reason: " " },
  ])
    expect(editedTransform(draft, edits).ok).toBe(false)
})
