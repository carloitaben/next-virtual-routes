import type { VariableDeclaration } from "@oxc-project/types"
import MagicString from "magic-string"
import type { Context } from "../lib"
import { MissingRouteContextError } from "../domain/errors"
import { EvaluationFailureError, evaluate } from "./evaluate"
import { injectContextDeclaration } from "./inject-context"
import {
  hasGlobalContextReference,
  parseModule,
  splitDirectivePrologue,
} from "./parse"
import { rewriteRelativeImports } from "./rewrite-imports"
import { serialize } from "./evaluate"

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
  program: ReturnType<typeof parseModule>["program"],
  banner: string,
  contextDeclaration: string | undefined,
  footer: string,
): string {
  const { body, prologue } = splitDirectivePrologue(code, program)
  const leadingSections = prologue.length > 0
    ? [prologue, banner, contextDeclaration ?? "", body]
    : [banner, contextDeclaration ?? "", body]

  return joinSections([...leadingSections, footer])
}

function rewriteExportDeclaration(
  magicString: MagicString,
  declaration: VariableDeclaration,
  routeContext: Context,
): void {
  for (const declarator of declaration.declarations) {
    if (!declarator.init) {
      continue
    }

    try {
      const evaluation = evaluate(declarator.init, {
        context: routeContext,
      })
      magicString.update(declarator.init.start, declarator.init.end, serialize(evaluation))
    } catch (error) {
      if (!(error instanceof EvaluationFailureError)) {
        throw error
      }
    }
  }
}

function staticallyFoldExports(
  magicString: MagicString,
  program: ReturnType<typeof parseModule>["program"],
  routeContext: Context,
): void {
  for (const statement of program.body) {
    if (
      statement.type === "ExportNamedDeclaration"
      && statement.declaration
      && statement.declaration.type === "VariableDeclaration"
    ) {
      rewriteExportDeclaration(magicString, statement.declaration, routeContext)
    }
  }
}

export function transform(code: string, options: TransformOptions): string {
  const parsed = parseModule(code, options.templateFile)
  const magicString = new MagicString(code)

  rewriteRelativeImports(code, magicString, parsed, {
    outputFile: options.outputFile,
    templateFile: options.templateFile,
  })

  if (!hasGlobalContextReference(parsed.program)) {
    return withDirectiveAwarePreludeAndFooter(
      magicString.toString(),
      parsed.program,
      options.banner,
      undefined,
      options.footer,
    )
  }

  if (!options.routeContext) {
    throw new MissingRouteContextError({ routePath: options.routePath })
  }

  staticallyFoldExports(magicString, parsed.program, options.routeContext)

  const transformedCode = magicString.toString()
  const transformedParsed = parseModule(transformedCode, options.outputFile)
  const contextDeclaration = hasGlobalContextReference(transformedParsed.program)
    ? injectContextDeclaration(options.routeContext)
    : undefined

  return withDirectiveAwarePreludeAndFooter(
    transformedCode,
    transformedParsed.program,
    options.banner,
    contextDeclaration,
    options.footer,
  )
}
