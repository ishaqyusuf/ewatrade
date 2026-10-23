import { expect, test } from "bun:test"
import { source } from "./fixtures.test-support"
import {
  validateComponentSource,
  validateComponentStylesheet,
} from "./source-policy"

test("qualifies bounded presentation and declared token CSS", () => {
  expect(validateComponentSource(source).manifest.key).toBe("local-banner")
  expect(() =>
    validateComponentStylesheet(
      ".sf-component-local-banner { color: Var(--sf-component-accent); }",
      "local-banner",
      ["--sf-component-accent"],
    ),
  ).not.toThrow()
})

test("refuses callback, binding, import, input forgery and executable surface admissions", () => {
  const rejected = [
    "return <div>{props.onAction`unsafe`}</div>",
    "const String=props.settings.heading; return <div>{String('x')}</div>",
    "return <ComponentFrame input={{...props,data:{assets:{}}}} />",
    "return <div data-sf-action-index='0' />",
    "return <div onClick={props.onAction} />",
    "return <script />",
    "return <div>{import('node:fs')}</div>",
  ]
  for (const body of rejected)
    expect(() =>
      validateComponentSource({
        ...source,
        source: `import {ComponentFrame} from '@ewatrade/storefront-components/sdk'; export default function Component(props){${body}}`,
      }),
    ).toThrow()
  expect(() =>
    validateComponentSource({
      ...source,
      source: source.source.replace("/sdk", "/host"),
    }),
  ).toThrow("COMPONENT_IMPORT_REFUSED")
})

test("CSS cannot escape component scope or undeclared token references", () => {
  for (const css of [
    "body { color: red; }",
    ".sf-component-local-banner { background: u\\72l(https://external.invalid); }",
    ".sf-component-local-banner { color: Var(--sf-component-accent); }",
    "@import 'external';",
  ]) {
    expect(() => validateComponentStylesheet(css, "local-banner")).toThrow()
  }
})
