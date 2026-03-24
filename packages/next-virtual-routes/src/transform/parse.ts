import { extname } from "node:path"
import { parseSync, type ParseResult } from "oxc-parser"
import type { Directive, Program, Statement } from "@oxc-project/types"
export { GLOBAL_IDENTIFIER, hasGlobalContextReference } from "./context-scope"

const TYPESCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"])
const JSX_EXTENSIONS = new Set([".jsx", ".tsx"])

function parserLanguage(filePath: string): NonNullable<Parameters<typeof parseSync>[2]>["lang"] {
  const extension = extname(filePath)
  if (TYPESCRIPT_EXTENSIONS.has(extension)) {
    return JSX_EXTENSIONS.has(extension) ? "tsx" : "ts"
  }

  return JSX_EXTENSIONS.has(extension) ? "jsx" : "js"
}

function isDirective(statement: Directive | Statement): statement is Directive {
  return statement.type === "ExpressionStatement" && typeof statement.directive === "string"
}

export function parseModule(code: string, filePath: string): ParseResult {
  return parseSync(filePath, code, {
    astType: "ts",
    lang: parserLanguage(filePath),
    range: true,
    sourceType: "module",
  })
}

export function splitDirectivePrologue(
  code: string,
  program: Program,
): Readonly<{ prologue: string; body: string }> {
  let boundary = 0

  for (const statement of program.body) {
    if (!isDirective(statement)) {
      break
    }

    boundary = statement.end
  }

  if (boundary === 0) {
    return { body: code, prologue: "" }
  }

  return {
    body: code.slice(boundary).replace(/^\s*/, ""),
    prologue: code.slice(0, boundary),
  }
}
