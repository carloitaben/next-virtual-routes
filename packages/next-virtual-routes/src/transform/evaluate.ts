import type { Node } from "estree"

type Vars = Record<PropertyKey, unknown>

export class EvaluationFailureError extends Error {
  constructor(node: Node) {
    super(`Unsupported node type: ${node.type}`)
    this.name = "EvaluationFailureError"
    this.cause = node
  }
}

function evaluateBinary(operator: string, left: unknown, right: unknown): unknown {
  switch (operator) {
    case "!=":
      return left != right
    case "!==":
      return left !== right
    case "%":
      return Number(left) % Number(right)
    case "*":
      return Number(left) * Number(right)
    case "+":
      return String(left) + String(right)
    case "-":
      return Number(left) - Number(right)
    case "/":
      return Number(left) / Number(right)
    case "<":
      return Number(left) < Number(right)
    case "<=":
      return Number(left) <= Number(right)
    case "==":
      return left == right
    case "===":
      return left === right
    case ">":
      return Number(left) > Number(right)
    case ">=":
      return Number(left) >= Number(right)
    default:
      throw new Error(`Unsupported binary operator: ${operator}`)
  }
}

function evaluateLogical(operator: string, left: unknown, right: () => unknown): unknown {
  switch (operator) {
    case "&&":
      return left ? right() : left
    case "??":
      return left ?? right()
    case "||":
      return left ? left : right()
    default:
      throw new Error(`Unsupported logical operator: ${operator}`)
  }
}

function evaluateObjectKey(node: Extract<Node, { type: "Property" }>, vars: Vars): PropertyKey {
  const value = node.computed || node.key.type !== "Identifier"
    ? evaluate(node.key, vars)
    : node.key.name

  if (typeof value === "number" || typeof value === "string" || typeof value === "symbol") {
    return value
  }

  throw new EvaluationFailureError(node)
}

export function evaluate(node: Node, vars: Vars = {}): unknown {
  switch (node.type) {
    case "ArrayExpression":
      return node.elements.map((element) => {
        if (element === null) {
          throw new EvaluationFailureError(node)
        }

        if (element.type === "SpreadElement") {
          const value = evaluate(element.argument, vars)
          if (!Array.isArray(value)) {
            throw new EvaluationFailureError(element)
          }
          return value
        }

        return [evaluate(element, vars)]
      }).flat()
    case "BinaryExpression":
      return evaluateBinary(
        node.operator,
        evaluate(node.left, vars),
        evaluate(node.right, vars),
      )
    case "ChainExpression":
      return evaluate(node.expression, vars)
    case "ConditionalExpression":
      return evaluate(node.test, vars)
        ? evaluate(node.consequent, vars)
        : evaluate(node.alternate, vars)
    case "ExpressionStatement":
      return evaluate(node.expression, vars)
    case "ExportNamedDeclaration":
      return node.declaration ? evaluate(node.declaration, vars) : undefined
    case "Identifier":
      if (!(node.name in vars)) {
        throw new EvaluationFailureError(node)
      }

      return vars[node.name]
    case "Literal":
      return node.value
    case "LogicalExpression":
      return evaluateLogical(node.operator, evaluate(node.left, vars), () =>
        evaluate(node.right, vars),
      )
    case "MemberExpression": {
      const object = evaluate(node.object, vars)
      const property = node.computed
        ? evaluate(node.property, vars)
        : node.property.type === "Identifier"
          ? node.property.name
          : evaluate(node.property, vars)

      if ((typeof object !== "object" && typeof object !== "function") || object === null) {
        throw new EvaluationFailureError(node)
      }

      if (
        typeof property !== "number" &&
        typeof property !== "string" &&
        typeof property !== "symbol"
      ) {
        throw new EvaluationFailureError(node)
      }

      return Reflect.get(object, property)
    }
    case "ObjectExpression": {
      const object: Record<PropertyKey, unknown> = {}

      for (const property of node.properties) {
        if (property.type === "SpreadElement") {
          const value = evaluate(property.argument, vars)
          if (value === null || typeof value !== "object") {
            throw new EvaluationFailureError(property)
          }

          Object.assign(object, value)
          continue
        }

        object[evaluateObjectKey(property, vars)] = evaluate(property.value, vars)
      }

      return object
    }
    case "Program": {
      const result = node.body.map((statement) => evaluate(statement, vars))
      return result.length > 1 ? result : result[0]
    }
    case "SequenceExpression": {
      const expression = node.expressions[node.expressions.length - 1]
      if (!expression) {
        throw new EvaluationFailureError(node)
      }
      return evaluate(expression, vars)
    }
    case "TemplateLiteral": {
      let result = ""

      for (const [index, quasi] of node.quasis.entries()) {
        result += quasi.value.cooked ?? ""
        const expression = node.expressions[index]
        if (expression) {
          result += String(evaluate(expression, vars))
        }
      }

      return result
    }
    case "UnaryExpression": {
      const value = evaluate(node.argument, vars)

      switch (node.operator) {
        case "!":
          return !value
        case "+":
          return Number(value)
        case "-":
          return -Number(value)
        case "~":
          return ~Number(value)
        case "typeof":
          return typeof value
        default:
          throw new EvaluationFailureError(node)
      }
    }
    case "VariableDeclaration": {
      const result = node.declarations.map((declaration) => evaluate(declaration, vars))
      return result.length > 1 ? result : result[0]
    }
    case "VariableDeclarator":
      return node.init ? evaluate(node.init, vars) : undefined
    default:
      throw new EvaluationFailureError(node)
  }
}

export function serialize(value: unknown): string {
  if (value === undefined) {
    return "undefined"
  }

  if (value instanceof Date) {
    return `new Date(${JSON.stringify(value.toISOString())})`
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => serialize(item)).join(", ")}]`
  }

  if (value !== null && typeof value === "object") {
    const properties = Object.entries(value).map(
      ([key, child]) => `${JSON.stringify(key)}: ${serialize(child)}`,
    )
    return `{ ${properties.join(", ")} }`
  }

  return JSON.stringify(value)
}
