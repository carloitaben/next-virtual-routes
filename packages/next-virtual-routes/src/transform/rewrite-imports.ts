import { dirname, relative, resolve } from "node:path"
import MagicString from "magic-string"
import { walk } from "zimmerframe"
import type { ExportAllDeclaration, ExportNamedDeclaration, ImportDeclaration, ImportExpression, Literal, Node } from "estree"

type StringLiteralNode = Literal & { value: string }

type RewriteImportOptions = Readonly<{
  outputFile: string
  templateFile: string
}>

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../")
}

function toImportSpecifier(path: string): string {
  const normalized = path.replaceAll("\\", "/")
  if (normalized.startsWith(".")) {
    return normalized
  }
  return `./${normalized}`
}

function rewriteSpecifier(
  specifier: string,
  options: RewriteImportOptions,
): string {
  const absoluteTarget = resolve(dirname(options.templateFile), specifier)
  const rewritten = relative(dirname(options.outputFile), absoluteTarget)
  return toImportSpecifier(rewritten)
}

function updateLiteral(
  magicString: MagicString,
  literal: StringLiteralNode,
  options: RewriteImportOptions,
): void {
  if (!literal.range || !isRelativeSpecifier(literal.value)) {
    return
  }

  magicString.update(
    literal.range[0],
    literal.range[1],
    JSON.stringify(rewriteSpecifier(literal.value, options)),
  )
}

function isStringLiteralNode(
  node: Literal | null | undefined,
): node is StringLiteralNode {
  return node !== null && node !== undefined && typeof node.value === "string" && Array.isArray(node.range)
}

export function rewriteRelativeImports(
  magicString: MagicString,
  ast: Node,
  options: RewriteImportOptions,
): string {
  walk(ast, null, {
    ExportAllDeclaration(node: ExportAllDeclaration) {
      if (isStringLiteralNode(node.source)) {
        updateLiteral(magicString, node.source, options)
      }
    },
    ExportNamedDeclaration(node: ExportNamedDeclaration) {
      if (isStringLiteralNode(node.source)) {
        updateLiteral(magicString, node.source, options)
      }
    },
    ImportDeclaration(node: ImportDeclaration) {
      if (isStringLiteralNode(node.source)) {
        updateLiteral(magicString, node.source, options)
      }
    },
    ImportExpression(node: ImportExpression) {
      if (node.source.type === "Literal" && isStringLiteralNode(node.source)) {
        updateLiteral(magicString, node.source, options)
      }
    },
  })

  return magicString.toString()
}
