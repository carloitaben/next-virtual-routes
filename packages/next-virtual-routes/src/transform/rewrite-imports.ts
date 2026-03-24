import { dirname, relative, resolve } from "node:path"
import type { DynamicImport, ParseResult, ValueSpan } from "oxc-parser"
import MagicString from "magic-string"

type RewriteImportOptions = Readonly<{
  outputFile: string
  templateFile: string
}>

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../")
}

function toImportSpecifier(path: string): string {
  const normalized = path.replaceAll("\\", "/")
  return normalized.startsWith(".") ? normalized : `./${normalized}`
}

function rewriteSpecifier(specifier: string, options: RewriteImportOptions): string {
  const absoluteTarget = resolve(dirname(options.templateFile), specifier)
  const rewritten = relative(dirname(options.outputFile), absoluteTarget)
  return toImportSpecifier(rewritten)
}

function updateLiteral(
  magicString: MagicString,
  request: ValueSpan,
  options: RewriteImportOptions,
): void {
  if (!isRelativeSpecifier(request.value)) {
    return
  }

  magicString.update(request.start, request.end, JSON.stringify(rewriteSpecifier(request.value, options)))
}

function updateDynamicImport(
  code: string,
  magicString: MagicString,
  dynamicImport: DynamicImport,
  options: RewriteImportOptions,
): void {
  const request = code.slice(dynamicImport.moduleRequest.start, dynamicImport.moduleRequest.end)
  const value = JSON.parse(request)

  if (typeof value !== "string" || !isRelativeSpecifier(value)) {
    return
  }

  magicString.update(
    dynamicImport.moduleRequest.start,
    dynamicImport.moduleRequest.end,
    JSON.stringify(rewriteSpecifier(value, options)),
  )
}

export function rewriteRelativeImports(
  code: string,
  magicString: MagicString,
  parsed: ParseResult,
  options: RewriteImportOptions,
): void {
  for (const statement of parsed.module.staticImports) {
    updateLiteral(magicString, statement.moduleRequest, options)
  }

  for (const statement of parsed.module.staticExports) {
    for (const entry of statement.entries) {
      if (entry.moduleRequest) {
        updateLiteral(magicString, entry.moduleRequest, options)
      }
    }
  }

  for (const dynamicImport of parsed.module.dynamicImports) {
    updateDynamicImport(code, magicString, dynamicImport, options)
  }
}
