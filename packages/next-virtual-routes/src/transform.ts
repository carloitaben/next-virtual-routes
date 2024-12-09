import * as acorn from "acorn"
import * as periscopic from "periscopic"
import MagicString from "magic-string"
import tsPlugin from "acorn-typescript"
import { walk } from "zimmerframe"
import type { Node } from "estree"
import type { Context } from "./lib"
import { evaluate, FailureError } from "./eval"
import { debug } from "./util"

export const GLOBAL_IDENTIFIER = "context"

export const ACORN_OPTIONS = {
  sourceType: "module",
  ecmaVersion: "latest",
  locations: true,
  ranges: true,
} satisfies acorn.Options

// @ts-expect-error
const parser = acorn.Parser.extend(tsPlugin())

function getGlobalIdentifier(node: Node) {
  const analysis = periscopic.analyze(node)
  const global = analysis.globals.get(GLOBAL_IDENTIFIER)

  if (global?.type === "Identifier") {
    return global
  }
}

function serialize(value: unknown): string {
  switch (typeof value) {
    case "undefined":
      return `${value}`
    case "object":
      if (value instanceof Date) {
        return `new Date(${value.getTime()})`
      } else if (Array.isArray(value)) {
        return `[${value.map((value) => serialize(value))}]`
      }
    default:
      return JSON.stringify(value, null, 2)
  }
}

export function transform(code: string, routeContext?: Context) {
  const ast = parser.parse(code, ACORN_OPTIONS)

  const global = getGlobalIdentifier(ast as Node)

  if (!global) {
    return code
  }

  if (!routeContext) {
    throw Error("TODO: warn necesitas pasar contexto animal")
  }

  const magicString = new MagicString(code)

  walk<Node, { evaluate: boolean }>(
    ast as Node,
    { evaluate: false },
    {
      _(node, { next }) {
        debug("ast: analyzing node", node.type)
        next()
      },
      /**
       * The analysis entry point.
       */
      ExportNamedDeclaration(node, context) {
        if (!node.declaration) {
          return context.stop()
        }

        if (!getGlobalIdentifier(node)) {
          return context.stop()
        }

        debug("ast: entering evaluation scope", node.type)
        context.next({ evaluate: true })
        debug("ast: leaving evaluation scope", node.type)
      },
      /**
       * Try to evaluate every `VariableDeclarator`
       * inside a previously analyzed `ExportNamedDeclaration`.
       */
      VariableDeclarator(node, context) {
        if (!context.state.evaluate) {
          return context.stop()
        }

        if (!node.init) {
          return context.stop()
        }

        if (!node.init.range) {
          throw Error("Invariant: missing parent range. This is likely a bug.")
        }

        try {
          const evaluation = evaluate(node.init, {
            [GLOBAL_IDENTIFIER]: routeContext,
          })

          const serialized = serialize(evaluation)

          magicString.update(node.init.range[0], node.init.range[1], serialized)
        } catch (error) {
          if (!(error instanceof FailureError)) {
            throw error
          }
        } finally {
          return void context.stop()
        }
      },
    }
  )

  const transformedCode = magicString.toString()
  const transformedCodeAst = parser.parse(transformedCode, {
    sourceType: "module",
    ecmaVersion: "latest",
    locations: true,
    ranges: true,
  })

  if (!getGlobalIdentifier(transformedCodeAst as Node)) {
    return transformedCode
  }

  return magicString
    .prepend(
      `const ${GLOBAL_IDENTIFIER} = ${JSON.stringify(routeContext, null, 2)}\n\n`
    )
    .toString()
}
