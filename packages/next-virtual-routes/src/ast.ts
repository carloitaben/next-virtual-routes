import * as acorn from "acorn"
import * as periscopic from "periscopic"
import MagicString from "magic-string"
import tsPlugin from "acorn-typescript"
import { walk } from "zimmerframe"
import type { Identifier, MemberExpression, Node } from "estree"
import type { RouteContext } from "./lib"

const GLOBAL_IDENTIFIER = "route"

// @ts-expect-error
const parser = acorn.Parser.extend(tsPlugin())

function canBeInlined(
  value: unknown
): value is string | number | boolean | null {
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return true
    default:
      return value === null
  }
}

function includesIdentifier(node: Node, identifier: Identifier) {
  if (node.type === "MemberExpression") {
    if (
      node.object.type === "Identifier" &&
      node.object.name === identifier.name
    ) {
      return true
    }

    return includesIdentifier(node.object, identifier)
  }

  return false
}

function getGlobalIdentifier(node: Node) {
  const analysis = periscopic.analyze(node)
  const global = analysis.globals.get(GLOBAL_IDENTIFIER)

  if (global?.type === "Identifier") {
    return global
  }
}

function getByProperties(
  object: Record<PropertyKey, unknown>,
  properties: PropertyKey[]
) {
  let current: unknown = object

  for (const property of properties) {
    if (current && typeof current === "object") {
      current = current[property as keyof typeof current]
    } else {
      current = undefined
    }
  }

  return current
}

function getKeys(node: MemberExpression, properties: PropertyKey[]) {
  switch (node.property.type) {
    case "Literal":
      switch (typeof node.property.value) {
        case "string":
        case "number":
          properties.unshift(node.property.value)
          break
      }
      break
    case "Identifier":
      properties.unshift(node.property.name)
      break
  }

  if (node.object.type === "MemberExpression") {
    return getKeys(node.object, properties)
  }

  return properties
}

export function transform(code: string, routeContext: RouteContext) {
  const ast = parser.parse(code, {
    sourceType: "module",
    ecmaVersion: "latest",
    locations: true,
    ranges: true,
  })

  const global = getGlobalIdentifier(ast as Node)

  if (!global) {
    return code
  }

  if (!routeContext.context) {
    throw Error("TODO: warn necesitas pasar contexto animal")
  }

  const magicString = new MagicString(code)

  let injectGlobalContext = false

  walk<
    Node,
    {
      global: Identifier
    } | null
  >(ast as Node, null, {
    /**
     * This is the analysis entry point.
     * Everything is an expression statement so we search every one of them
     * for `GLOBAL_IDENTIFIER` reference
     */
    ExpressionStatement(node, context) {
      if (!context.state) {
        const global = getGlobalIdentifier(node)

        if (!global) {
          return void context.next()
        }

        return void context.visit(node.expression, {
          global,
        })
      }
    },
    /**
     * The `GLOBAL_IDENTIFIER` is accessed through member expressions.
     */
    MemberExpression(node, context) {
      if (!node.range) {
        throw Error("Invariant: missing parent range. This is likely a bug.")
      }

      if (!context.state) {
        return void context.next()
      }

      switch (node.property.type) {
        case "Identifier":
        case "Literal":
          break
        default:
          return void context.next()
      }

      if (!includesIdentifier(node, context.state.global)) {
        return void context.next()
      }

      const keys = getKeys(node, [])
      const value = getByProperties(routeContext, keys)

      if (!canBeInlined(value)) {
        return void context.next()
      }

      magicString.update(
        node.range[0],
        node.range[1],
        JSON.stringify(value, null, 2)
      )

      return context.next()
    },
  })

  if (injectGlobalContext) {
    magicString.prepend(
      [
        // TODO: add ignore things her
        `const route = ${JSON.stringify(routeContext, null, 2)}`,
        "\n",
      ].join("\n")
    )

    // TODO: evaluate resulting code with this https://github.com/browserify/static-eval/blob/master/index.js
  }

  return magicString.toString()
}
