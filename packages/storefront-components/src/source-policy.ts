import ts from "typescript"
import {
  COMPONENT_LIMITS,
  type COMPONENT_TOKENS,
  type ComponentSource,
  componentSourceSchema,
} from "./contracts"

const sdkNames = new Set([
  "ComponentProps",
  "ComponentFrame",
  "ComponentText",
  "ComponentAsset",
  "ComponentAction",
])
const reactNames = new Set(["Fragment", "ReactNode", "CSSProperties"])
const nativeTags = new Set([
  "section",
  "article",
  "header",
  "footer",
  "div",
  "span",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "em",
  "small",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "figure",
  "figcaption",
  "hr",
  "br",
])
const forbiddenNames = new Set([
  "globalThis",
  "window",
  "self",
  "document",
  "navigator",
  "location",
  "process",
  "Bun",
  "Deno",
  "require",
  "module",
  "exports",
  "eval",
  "Function",
  "AsyncFunction",
  "GeneratorFunction",
  "Reflect",
  "Proxy",
  "Object",
  "constructor",
  "prototype",
  "__proto__",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "Worker",
  "SharedWorker",
  "importScripts",
  "setTimeout",
  "setInterval",
  "queueMicrotask",
  "Atomics",
  "SharedArrayBuffer",
  "WebAssembly",
  "console",
  "onAction",
])
const methods = new Set([
  "map",
  "filter",
  "slice",
  "find",
  "includes",
  "join",
  "toFixed",
  "toLocaleString",
])
const cssProperties = new Set([
  "display",
  "grid-template-columns",
  "grid-template-rows",
  "grid-column",
  "grid-row",
  "grid-auto-flow",
  "gap",
  "row-gap",
  "column-gap",
  "align-items",
  "justify-content",
  "justify-items",
  "flex-direction",
  "flex-wrap",
  "flex",
  "order",
  "width",
  "max-width",
  "min-width",
  "height",
  "max-height",
  "min-height",
  "padding",
  "padding-inline",
  "padding-block",
  "margin",
  "margin-inline",
  "margin-block",
  "border",
  "border-width",
  "border-color",
  "border-style",
  "border-radius",
  "background",
  "background-color",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-transform",
  "text-decoration",
  "white-space",
  "overflow-wrap",
  "word-break",
  "object-fit",
  "aspect-ratio",
  "overflow",
  "opacity",
  "outline",
  "outline-offset",
])
const cssFunctions = new Set([
  "var",
  "calc",
  "min",
  "max",
  "clamp",
  "repeat",
  "minmax",
  "rgb",
  "rgba",
])

/** Qualification diagnostics only. Generated code still runs solely inside the OS sandbox. */
export function validateComponentSource(value: unknown): ComponentSource {
  const source = componentSourceSchema.parse(value)
  const file = ts.createSourceFile(
    "Component.tsx",
    source.source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX,
  )
  if (
    (file as ts.SourceFile & { parseDiagnostics?: readonly unknown[] })
      .parseDiagnostics?.length
  )
    throw new Error("COMPONENT_SOURCE_PARSE_FAILED")
  const allowedTags = new Set(nativeTags)
  let componentFunctions = 0
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      const specifier = ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : ""
      const allowedNames =
        specifier === "react"
          ? reactNames
          : specifier === "@ewatrade/storefront-components/sdk"
            ? sdkNames
            : null
      const bindings = statement.importClause?.namedBindings
      if (
        !allowedNames ||
        statement.importClause?.name ||
        !bindings ||
        !ts.isNamedImports(bindings) ||
        statement.attributes
      )
        throw new Error("COMPONENT_IMPORT_REFUSED")
      for (const binding of bindings.elements) {
        const original = binding.propertyName?.text ?? binding.name.text
        if (!allowedNames.has(original))
          throw new Error("COMPONENT_IMPORT_REFUSED")
        if (
          [
            "ComponentFrame",
            "ComponentText",
            "ComponentAsset",
            "ComponentAction",
            "Fragment",
          ].includes(original)
        )
          allowedTags.add(binding.name.text)
      }
    } else if (ts.isFunctionDeclaration(statement)) {
      if (
        statement.name?.text !== "Component" ||
        statement.parameters.length !== 1 ||
        statement.parameters[0]?.name.getText(file) !== "props" ||
        statement.parameters[0]?.initializer ||
        !statement.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        ) ||
        !statement.modifiers.some(
          (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
        )
      )
        throw new Error("COMPONENT_ENTRY_REFUSED")
      componentFunctions++
    } else if (
      !ts.isTypeAliasDeclaration(statement) &&
      !ts.isInterfaceDeclaration(statement) &&
      !ts.isEmptyStatement(statement)
    )
      throw new Error("COMPONENT_TOP_LEVEL_EXECUTION_REFUSED")
  }
  if (componentFunctions !== 1) throw new Error("COMPONENT_ENTRY_REFUSED")
  let count = 0
  const walk = (node: ts.Node): void => {
    if (++count > COMPONENT_LIMITS.sourceNodes)
      throw new Error("COMPONENT_SOURCE_NODE_LIMIT")
    if (ts.isIdentifier(node) && forbiddenNames.has(node.text))
      throw new Error("COMPONENT_GLOBAL_OR_PROTOTYPE_REFUSED")
    if (
      ts.isVariableDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isBindingElement(node) ||
      ts.isImportSpecifier(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node)
    ) {
      if (
        node.name &&
        (!ts.isIdentifier(node.name) ||
          ["String", "Number", "onAction"].includes(node.name.text))
      )
        throw new Error("COMPONENT_BINDING_REFUSED")
    }
    if (
      ts.isNewExpression(node) ||
      ts.isTaggedTemplateExpression(node) ||
      ts.isImportTypeNode(node) ||
      ts.isAwaitExpression(node) ||
      ts.isYieldExpression(node) ||
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isDeleteExpression(node) ||
      ts.isPostfixUnaryExpression(node) ||
      ts.isJsxSpreadAttribute(node)
    )
      throw new Error("COMPONENT_EXECUTION_CONSTRUCT_REFUSED")
    if (
      ts.isPrefixUnaryExpression(node) &&
      [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(
        node.operator,
      )
    )
      throw new Error("COMPONENT_EXECUTION_CONSTRUCT_REFUSED")
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    )
      throw new Error("COMPONENT_MUTATION_REFUSED")
    if (ts.isElementAccessExpression(node)) {
      const key = node.argumentExpression
      if (
        !key ||
        (!ts.isStringLiteral(key) && !ts.isNumericLiteral(key)) ||
        (ts.isStringLiteral(key) &&
          (forbiddenNames.has(key.text) || key.text === "onAction"))
      )
        throw new Error("COMPONENT_DYNAMIC_PROPERTY_REFUSED")
    }
    if (ts.isCallExpression(node)) {
      const target = node.expression
      if (
        !(
          ts.isIdentifier(target) && ["String", "Number"].includes(target.text)
        ) &&
        !(
          ts.isPropertyAccessExpression(target) && methods.has(target.name.text)
        )
      )
        throw new Error("COMPONENT_CALL_REFUSED")
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(file)
      if (!allowedTags.has(tag)) throw new Error("COMPONENT_ELEMENT_REFUSED")
      for (const property of node.attributes.properties) {
        if (!ts.isJsxAttribute(property))
          throw new Error("COMPONENT_ATTRIBUTES_REFUSED")
        const name = property.name.getText(file)
        if (
          [
            "dangerouslySetInnerHTML",
            "srcDoc",
            "style",
            "href",
            "src",
            "ref",
            "is",
            "contentEditable",
            "formAction",
            "input",
            "data-sf-action-index",
          ].includes(name)
        )
          throw new Error("COMPONENT_ATTRIBUTES_REFUSED")
        if (/^on/i.test(name))
          throw new Error("COMPONENT_EVENT_HANDLER_REFUSED")
      }
    }
    ts.forEachChild(node, walk)
  }
  walk(file)
  validateComponentStylesheet(
    source.stylesheet,
    source.manifest.key,
    source.manifest.tokens,
  )
  return source
}

/** Deliberately small CSS grammar: scoped selectors, finite properties/functions, no escapes or at-rules. */
export function validateComponentStylesheet(
  stylesheet: string,
  key: string,
  declaredTokens: readonly (typeof COMPONENT_TOKENS)[number][] = [],
) {
  const css = stylesheet.replace(/\/\*[\s\S]*?\*\//g, "").trim()
  if (
    /[\\@<>]/.test(css) ||
    /\/\*|url\s*\(|expression\s*\(|image-set\s*\(|behavior\s*:|-moz-binding/i.test(
      css,
    )
  )
    throw new Error("COMPONENT_CSS_REFUSED")
  let remainder = css
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (match[1] ?? "").trim().split(",")
    for (const selector of selectors) {
      const value = selector.trim()
      const prefix = `.sf-component-${key}`
      if (
        !value.startsWith(prefix) ||
        !/^(?:[ .>a-z0-9-])+$/.test(value) ||
        (value.length > prefix.length &&
          !/[ >]/.test(value[prefix.length] ?? ""))
      )
        throw new Error("COMPONENT_CSS_SCOPE_REFUSED")
    }
    for (const declaration of (match[2] ?? "")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean)) {
      const separator = declaration.indexOf(":")
      const property = declaration.slice(0, separator).trim()
      const value = declaration.slice(separator + 1).trim()
      if (
        separator < 1 ||
        !cssProperties.has(property) ||
        !value ||
        !/^[a-zA-Z0-9\s#.,()%+*/-]+$/.test(value)
      )
        throw new Error("COMPONENT_CSS_VALUE_REFUSED")
      for (const call of value.matchAll(/([a-z-]+)\s*\(/gi))
        if (!cssFunctions.has((call[1] ?? "").toLowerCase()))
          throw new Error("COMPONENT_CSS_FUNCTION_REFUSED")
      for (const token of value.matchAll(/var\s*\(([^)]+)\)/gi))
        if (
          !declaredTokens.includes(
            (token[1] ?? "").trim() as (typeof COMPONENT_TOKENS)[number],
          )
        )
          throw new Error("COMPONENT_CSS_TOKEN_REFUSED")
    }
    remainder = remainder.replace(match[0], "")
  }
  if (remainder.trim()) throw new Error("COMPONENT_CSS_PARSE_FAILED")
}
