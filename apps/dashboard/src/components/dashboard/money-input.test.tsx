import { expect, test } from "bun:test"
import { CurrencyInput, MoneyInput } from "@ewatrade/ui"
import { OPERATING_CURRENCIES } from "@ewatrade/utils"
import { renderToStaticMarkup } from "react-dom/server"

test("all operating currencies use a separate Input Group prefix and preserve the editable amount", () => {
  for (const { code, symbol } of OPERATING_CURRENCIES) {
    for (const input of [
      <MoneyInput
        key="raw"
        currencyCode={code}
        aria-label="Amount"
        name="amount"
        value="1234.50"
        onChange={() => {}}
      />,
      <CurrencyInput
        key="formatted"
        currencyCode={code}
        aria-label="Price"
        name="price"
        value="1234.50"
        onValueChange={() => {}}
      />,
    ]) {
      const markup = renderToStaticMarkup(input)
      expect(markup).toContain('data-slot="input-group"')
      expect(markup).toContain('data-slot="input-group-control"')
      expect(markup).toContain('data-align="inline-start"')
      expect(markup).toContain(`Currency ${code}`)
      expect(markup).toContain(`>${symbol}</span>`)
      expect(markup).not.toMatch(/value="[^\"]*(?:₦|GH₵|KSh|R |E£|\$)/)
      expect(markup).toContain("name=")
    }
  }
})

test("money inputs retain form identity, decimals, disabled state and validation", () => {
  const markup = renderToStaticMarkup(
    <MoneyInput
      currencyCode="NGN"
      id="fee"
      name="fee"
      defaultValue="12.50"
      required
      disabled
      aria-invalid="true"
    />,
  )
  expect(markup).toContain('value="12.50"')
  expect(markup).toContain('name="fee"')
  expect(markup).toContain('id="fee"')
  expect(markup).toContain('disabled=""')
  expect(markup).toContain('aria-invalid="true"')
})
