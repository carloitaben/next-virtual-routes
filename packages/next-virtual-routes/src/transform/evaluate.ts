import type {
  ChainExpression,
  IdentifierName,
  MemberExpression,
  Node,
  ObjectExpression,
  SequenceExpression,
  TemplateLiteral,
  UnaryExpression,
} from "@oxc-project/types"

type Vars = Record<string, unknown>
type ValueKey = string | number | symbol
type BinaryLike = Extract<Node, { type: "BinaryExpression" }>

function isIdentifierNode(node: Node): node is IdentifierName {
  return node.type === "Identifier" && typeof node.name === "string"
}

export class EvaluationFailureError extends Error {
  constructor(node: Node) {
    super(`Unsupported node type: "${node.type}"`)
    this.name = "EvaluationFailureError"
    this.cause = node
  }
}

function evaluateBinary(node: BinaryLike, vars: Vars): unknown {
  if (node.operator === "in" && node.left.type === "PrivateIdentifier") {
    throw new EvaluationFailureError(node)
  }

  const leftValue = evaluate(node.left, vars)
  const rightValue = evaluate(node.right, vars)

  switch (node.operator) {
    case "+":
      return typeof leftValue === "string" || typeof rightValue === "string"
        ? String(leftValue) + String(rightValue)
        : Number(leftValue) + Number(rightValue)
    case "-":
      return Number(leftValue) - Number(rightValue)
    case "*":
      return Number(leftValue) * Number(rightValue)
    case "/":
      return Number(leftValue) / Number(rightValue)
    case "%":
      return Number(leftValue) % Number(rightValue)
    case "==":
      return leftValue == rightValue
    case "===":
      return leftValue === rightValue
    case "!=":
      return leftValue != rightValue
    case "!==":
      return leftValue !== rightValue
    case "<":
      return Number(leftValue) < Number(rightValue)
    case "<=":
      return Number(leftValue) <= Number(rightValue)
    case ">":
      return Number(leftValue) > Number(rightValue)
    case ">=":
      return Number(leftValue) >= Number(rightValue)
    default:
      throw new EvaluationFailureError(node)
  }
}

function evaluateIdentifier(node: IdentifierName, vars: Vars): unknown {
  if (!(node.name in vars)) {
    throw new EvaluationFailureError(node)
  }

  return vars[node.name]
}

function evaluatePropertyKey(node: Node, vars: Vars): ValueKey {
  if (isIdentifierNode(node)) {
    return node.name
  }

  if (node.type === "PrivateIdentifier") {
    throw new EvaluationFailureError(node)
  }

  const value = evaluate(node, vars)
  if (typeof value === "string" || typeof value === "number" || typeof value === "symbol") {
    return value
  }

  throw new EvaluationFailureError(node)
}

function evaluateMember(node: MemberExpression, vars: Vars): unknown {
  const object = evaluate(node.object, vars)
  if (object === null || (typeof object !== "object" && typeof object !== "function")) {
    throw new EvaluationFailureError(node)
  }

  if (!node.computed && node.property.type === "Identifier") {
    return Reflect.get(object, node.property.name)
  }

  return Reflect.get(object, evaluatePropertyKey(node.property, vars))
}

function evaluateObject(node: ObjectExpression, vars: Vars): Record<ValueKey, unknown> {
  const object: Record<ValueKey, unknown> = {}

  for (const property of node.properties) {
    if (property.type === "SpreadElement") {
      const value = evaluate(property.argument, vars)
      if (value === null || typeof value !== "object") {
        throw new EvaluationFailureError(property)
      }

      Object.assign(object, value)
      continue
    }

    const value = property.shorthand && isIdentifierNode(property.key)
      ? evaluateIdentifier(property.key, vars)
      : evaluate(property.value, vars)
    object[evaluatePropertyKey(property.key, vars)] = value
  }

  return object
}

function evaluateTemplate(node: TemplateLiteral, vars: Vars): string {
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

function evaluateUnary(node: UnaryExpression, vars: Vars): unknown {
  const argument = evaluate(node.argument, vars)

  switch (node.operator) {
    case "+":
      return Number(argument)
    case "-":
      return -Number(argument)
    case "~":
      return ~Number(argument)
    case "!":
      return !argument
    case "typeof":
      return typeof argument
    default:
      throw new EvaluationFailureError(node)
  }
}

function evaluateSequence(node: SequenceExpression, vars: Vars): unknown {
  const expression = node.expressions[node.expressions.length - 1]
  if (!expression) {
    throw new EvaluationFailureError(node)
  }

  return evaluate(expression, vars)
}

function evaluateChain(node: ChainExpression, vars: Vars): unknown {
  const expression = node.expression
  if (expression.type !== "MemberExpression") {
    throw new EvaluationFailureError(node)
  }

  const object = evaluate(expression.object, vars)
  if (object == null) {
    return undefined
  }

  if (!expression.computed && expression.property.type === "Identifier") {
    return Reflect.get(object, expression.property.name)
  }

  return Reflect.get(object, evaluatePropertyKey(expression.property, vars))
}

export function evaluate(node: Node, vars: Vars = {}): unknown {
  switch (node.type) {
    case "Program": {
      const body = node.body.map((statement) => evaluate(statement, vars))
      return body.length > 1 ? body : body[0]
    }
    case "ExportNamedDeclaration":
      return node.declaration ? evaluate(node.declaration, vars) : undefined
    case "VariableDeclaration": {
      const values = node.declarations.map((declaration) => evaluate(declaration, vars))
      return values.length > 1 ? values : values[0]
    }
    case "VariableDeclarator":
      return node.init ? evaluate(node.init, vars) : undefined
    case "ExpressionStatement":
      return evaluate(node.expression, vars)
    case "Literal":
      return node.value
    case "UnaryExpression":
      return evaluateUnary(node, vars)
    case "ArrayExpression":
      return node.elements.map((element) => {
        if (!element) {
          throw new EvaluationFailureError(node)
        }

        return element.type === "SpreadElement"
          ? (() => {
            const value = evaluate(element.argument, vars)
            if (!Array.isArray(value)) {
              throw new EvaluationFailureError(element)
            }
            return value
          })()
          : evaluate(element, vars)
      }).flat()
    case "ObjectExpression":
      return evaluateObject(node, vars)
    case "BinaryExpression":
      return evaluateBinary(node, vars)
    case "LogicalExpression": {
      const left = evaluate(node.left, vars)
      switch (node.operator) {
        case "&&":
          return left ? evaluate(node.right, vars) : left
        case "||":
          return left ? left : evaluate(node.right, vars)
        case "??":
          return left ?? evaluate(node.right, vars)
        default:
          throw new EvaluationFailureError(node)
      }
    }
    case "Identifier":
      return isIdentifierNode(node)
        ? evaluateIdentifier(node, vars)
        : (() => {
          throw new EvaluationFailureError(node)
        })()
    case "CallExpression":
    case "ImportExpression":
      throw new EvaluationFailureError(node)
    case "MemberExpression":
      return evaluateMember(node, vars)
    case "ConditionalExpression":
      return evaluate(node.test, vars)
        ? evaluate(node.consequent, vars)
        : evaluate(node.alternate, vars)
    case "TemplateLiteral":
      return evaluateTemplate(node, vars)
    case "ChainExpression":
      return evaluateChain(node, vars)
    case "ParenthesizedExpression":
      return evaluate(node.expression, vars)
    case "TSAsExpression":
    case "TSNonNullExpression":
    case "TSSatisfiesExpression":
    case "TSTypeAssertion":
      return evaluate(node.expression, vars)
    case "SequenceExpression":
      return evaluateSequence(node, vars)
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
