import * as ts from "typescript"
import { NATIVE_ENVIRONMENT_KEYS } from "./release-mobile-environment"

const SELECTOR_NAMES = new Set([
  "APP_ENV",
  "APP_VARIANT",
  "EXPO_PUBLIC_APP_VARIANT",
  "EAS_BUILD_PROFILE",
])
const NATIVE_NAMES = new Set<string>(NATIVE_ENVIRONMENT_KEYS)

/**
 * Conservatively checks direct environment reads in a candidate config or plugin.
 * This is a source guard, not a proof about dynamically loaded or imported code.
 */
export function assertConfigSourceEnvironment(
  source: string,
  fileName: string,
  approvedNames: readonly string[] = [],
): void {
  if (approvedNames.some((name) => !NATIVE_NAMES.has(name))) {
    throw new Error(
      "Approved config environment names must be reviewed native parameters.",
    )
  }
  const allowed = new Set([...SELECTOR_NAMES, ...approvedNames])
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(fileName),
  )
  const diagnostics =
    ts.transpileModule(source, {
      fileName,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.Preserve,
      },
    }).diagnostics ?? []
  if (
    diagnostics.some(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    )
  ) {
    throw new Error(
      `Config source cannot be parsed for environment reads: ${fileName}`,
    )
  }
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      isProcessModule(statement.moduleSpecifier.text)
    ) {
      throw new Error(`Config source imports the process module: ${fileName}`)
    }
    if (
      ts.isImportEqualsDeclaration(statement) &&
      ts.isExternalModuleReference(statement.moduleReference)
    ) {
      const module = statement.moduleReference.expression
      if (module && ts.isStringLiteral(module) && isProcessModule(module.text))
        throw new Error(`Config source imports the process module: ${fileName}`)
    }
  }

  const inspect = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const isRequire =
        ts.isIdentifier(node.expression) && node.expression.text === "require"
      const isDynamicImport =
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      const moduleArgument = node.arguments[0]
      if (
        (isRequire || isDynamicImport) &&
        moduleArgument &&
        ts.isStringLiteral(moduleArgument) &&
        isProcessModule(moduleArgument.text)
      ) {
        throw new Error(`Config source imports the process module: ${fileName}`)
      }
    }
    if (
      ts.isIdentifier(node) &&
      ["process", "globalThis", "global"].includes(node.text)
    ) {
      if (
        ts.isPropertyAccessExpression(node.parent) &&
        node.parent.name === node
      )
        return
      const access = outerAccess(node)
      const parts = access ? accessParts(access) : null
      const processIndex = parts?.indexOf("process") ?? -1
      const prefixOkay =
        parts !== null &&
        ((processIndex === 0 && parts.length >= 3) ||
          (processIndex === 1 &&
            (parts[0] === "globalThis" || parts[0] === "global") &&
            parts.length >= 4))
      const environmentName =
        prefixOkay &&
        parts?.[processIndex + 1] === "env" &&
        parts.length >= processIndex + 3
          ? parts[processIndex + 2]
          : null
      if (!environmentName || !allowed.has(environmentName)) {
        throw new Error(
          `Config source uses an unapproved or indirect environment access: ${fileName}`,
        )
      }
      return
    }
    ts.forEachChild(node, inspect)
  }
  inspect(sourceFile)
}

function outerAccess(node: ts.Identifier): ts.Expression | null {
  let current: ts.Expression = node
  while (true) {
    const parent = current.parent
    if (
      (ts.isParenthesizedExpression(parent) ||
        ts.isAsExpression(parent) ||
        ts.isTypeAssertionExpression(parent) ||
        ts.isNonNullExpression(parent) ||
        ts.isSatisfiesExpression(parent)) &&
      parent.expression === current
    ) {
      current = parent
      continue
    }
    if (
      (ts.isPropertyAccessExpression(parent) ||
        ts.isElementAccessExpression(parent)) &&
      parent.expression === current
    ) {
      current = parent
      continue
    }
    return current === node ? null : current
  }
}

function isProcessModule(name: string): boolean {
  return (
    name === "process" ||
    name === "node:process" ||
    name.startsWith("process/") ||
    name.startsWith("node:process/")
  )
}

function accessParts(expression: ts.Expression): string[] | null {
  const parts: string[] = []
  let current = unwrap(expression)
  while (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current)
  ) {
    if (ts.isPropertyAccessExpression(current)) parts.unshift(current.name.text)
    else {
      const argument = current.argumentExpression
      if (
        !argument ||
        (!ts.isStringLiteral(argument) &&
          !ts.isNoSubstitutionTemplateLiteral(argument))
      )
        return null
      parts.unshift(argument.text)
    }
    current = unwrap(current.expression)
  }
  if (!ts.isIdentifier(current)) return null
  parts.unshift(current.text)
  return parts
}

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  )
    current = current.expression
  return current
}

function scriptKind(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX
  if (fileName.endsWith(".jsx")) return ts.ScriptKind.JSX
  if (
    fileName.endsWith(".js") ||
    fileName.endsWith(".mjs") ||
    fileName.endsWith(".cjs")
  )
    return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}
