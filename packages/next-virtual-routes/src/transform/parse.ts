import * as acorn from "acorn"
import * as periscopic from "periscopic"
import tsPlugin from "acorn-typescript"
import type { ExpressionStatement, Node } from "estree"

export const GLOBAL_IDENTIFIER = "context"

export const ACORN_OPTIONS = {
  ecmaVersion: "latest",
  locations: true,
  ranges: true,
  sourceType: "module",
} satisfies acorn.Options

// @ts-expect-error acorn-typescript extends the parser dynamically.
const parser = acorn.Parser.extend(tsPlugin())

export function parseModule(code: string): Node {
  // @ts-expect-error acorn returns an ESTree-compatible module node here.
  return parser.parse(code, ACORN_OPTIONS)
}

export function hasGlobalContextReference(node: Node): boolean {
  return periscopic.analyze(node).globals.has(GLOBAL_IDENTIFIER)
}

function isDirective(statement: Node): statement is ExpressionStatement {
  return (
    statement.type === "ExpressionStatement" &&
    statement.expression.type === "Literal" &&
    typeof statement.expression.value === "string"
  )
}

export function splitDirectivePrologue(
  code: string,
  ast: Node,
): Readonly<{ prologue: string; body: string }> {
  if (ast.type !== "Program") {
    return { body: code, prologue: "" }
  }

  let boundary = 0
  for (const statement of ast.body) {
    if (!isDirective(statement) || !statement.range) {
      break
    }

    boundary = statement.range[1]
  }

  if (boundary === 0) {
    return { body: code, prologue: "" }
  }

  return {
    body: code.slice(boundary).replace(/^\s*/, ""),
    prologue: code.slice(0, boundary),
  }
}
