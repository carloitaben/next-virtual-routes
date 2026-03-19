import MagicString from "magic-string"
import { walk } from "zimmerframe"
import type { Node } from "estree"
import type { Context } from "../lib"
import { MissingRouteContextError } from "../domain/errors"
import { EvaluationFailureError, evaluate, serialize } from "./evaluate"
import { injectContextDeclaration } from "./inject-context"
import {
  GLOBAL_IDENTIFIER,
  hasGlobalContextReference,
  parseModule,
  splitDirectivePrologue,
} from "./parse"
import { rewriteRelativeImports } from "./rewrite-imports"

type TransformOptions = Readonly<{
  banner: string
  footer: string
  outputFile: string
  routeContext?: Context
  routePath: string
  templateFile: string
}>

function joinSections(sections: ReadonlyArray<string>): string {
  return sections.filter((section) => section.length > 0).join("\n\n")
}

function withDirectiveAwarePreludeAndFooter(
  code: string,
  ast: Node,
  banner: string,
  contextDeclaration: string | undefined,
  footer: string,
): string {
  const { body, prologue } = splitDirectivePrologue(code, ast)
  const leadingSections = prologue.length > 0
    ? [prologue, banner, contextDeclaration ?? "", body]
    : [banner, contextDeclaration ?? "", body]

  return joinSections([...leadingSections, footer])
}

function staticallyFoldExports(
  ast: Node,
  magicString: MagicString,
  routeContext: Context,
): void {
  walk<Node, { evaluate: boolean }>(
    ast,
    { evaluate: false },
    {
      ExportNamedDeclaration(node, context) {
        if (!node.declaration || !hasGlobalContextReference(node)) {
          return context.stop()
        }

        context.next({ evaluate: true })
      },
      VariableDeclarator(node, context) {
        if (!context.state.evaluate || !node.init || !node.init.range) {
          return context.stop()
        }

        try {
          const evaluation = evaluate(node.init, {
            [GLOBAL_IDENTIFIER]: routeContext,
          })

          magicString.update(
            node.init.range[0],
            node.init.range[1],
            serialize(evaluation),
          )
        } catch (error) {
          if (!(error instanceof EvaluationFailureError)) {
            throw error
          }
        }

        return context.stop()
      },
    },
  )
}

export function transform(code: string, options: TransformOptions): string {
  const ast = parseModule(code)
  const magicString = new MagicString(code)

  rewriteRelativeImports(magicString, ast, {
    outputFile: options.outputFile,
    templateFile: options.templateFile,
  })

  if (!hasGlobalContextReference(ast)) {
    const output = magicString.toString()
    return withDirectiveAwarePreludeAndFooter(
      output,
      ast,
      options.banner,
      undefined,
      options.footer,
    )
  }

  if (!options.routeContext) {
    throw new MissingRouteContextError({ routePath: options.routePath })
  }

  staticallyFoldExports(ast, magicString, options.routeContext)

  const transformedCode = magicString.toString()
  const transformedAst = parseModule(transformedCode)
  const contextDeclaration = hasGlobalContextReference(transformedAst)
    ? injectContextDeclaration(options.routeContext)
    : undefined

  return withDirectiveAwarePreludeAndFooter(
    transformedCode,
    transformedAst,
    options.banner,
    contextDeclaration,
    options.footer,
  )
}
