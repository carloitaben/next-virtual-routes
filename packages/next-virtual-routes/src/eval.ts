import { Effect } from "effect"
import ts from "typescript"

// si hay directiva, encontrarla
// si hay imports, encontrar el último
// y entonces poner el contexto
//

function hasExportModifier(node: {
  modifiers?: ts.NodeArray<ts.ModifierLike>
}) {
  return node.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  )
}

export const parse = Effect.fn(
  ({ code }: { code: string; from: string; to: string }) =>
    Effect.gen(function* () {
      const sourceFile = ts.createSourceFile(
        "foo.ts",
        code,
        ts.ScriptTarget.Latest,
        true,
      )

      const directives: ts.StringLiteral[] = []
      const importDeclarations: ts.ImportDeclaration[] = []
      const exportDeclarations = []

      function evaluate(node: ts.Node) {
        console.log("evaluating node")
        console.log(node.getFullText())
        console.log("---")

        // Directives
        if (
          ts.isExpressionStatement(node) &&
          ts.isStringLiteral(node.expression)
        ) {
          directives.push(node.expression)
          return
        }

        // Imports
        if (ts.isImportDeclaration(node)) {
          importDeclarations.push(node)
          return
        }

        // `export const`
        if (ts.isVariableStatement(node) && hasExportModifier(node)) {
          exportDeclarations.push(node)
        }

        // `export function`
        if (ts.isFunctionDeclaration(node) && hasExportModifier(node)) {
          exportDeclarations.push(node)
        }
      }

      sourceFile.statements.forEach((statement) => {
        evaluate(statement)
      })

      const contextPlace = importDeclarations?.at(-1) || directives?.at(-1)
    }),
)

// import type { Node } from "estree"

// type Vars = Record<PropertyKey, unknown>

// export class FailureError extends Error {
//   constructor(node: Node) {
//     super()
//     this.name = "FailureError"
//     this.message = `Unsupported node type: "${node.type}"`
//     this.cause = node
//   }
// }

export function evaluate(node: Node, vars: Vars = {}): any {
  switch (node.type) {
    case "Program":
      const body = node.body.map((node) => evaluate(node, vars))
      return body.length > 1 ? body : body[0]
    case "ExportNamedDeclaration":
      return node.declaration
        ? evaluate(node.declaration, vars)
        : node.declaration
    case "VariableDeclaration":
      const result = node.declarations.map((declaration) =>
        evaluate(declaration, vars),
      )

      return result.length > 1 ? result : result[0]
    case "VariableDeclarator":
      return node.init ? evaluate(node.init, vars) : node.init
    case "ExpressionStatement":
      return evaluate(node.expression, vars)
    case "Literal":
      return node.value
    case "UnaryExpression":
      const argValue = evaluate(node.argument, vars)
      switch (node.operator) {
        case "+":
          return +argValue
        case "-":
          return -argValue
        case "~":
          return ~argValue
        case "!":
          return !argValue
        default:
          throw new FailureError(node)
      }
    case "ArrayExpression":
      return node.elements.map((element) => {
        if (!element) throw new FailureError(node)
        return evaluate(element, vars)
      })
    case "ObjectExpression":
      const object: Record<PropertyKey, any> = {}
      for (const prop of node.properties) {
        if (prop.type === "SpreadElement") {
          throw new FailureError(prop)
        }

        const key =
          prop.key.type === "Identifier" ? prop.key.name : prop.key.value

        const value = evaluate(prop.value, vars)
        object[key] = value
      }

      return object
    case "BinaryExpression":
      const leftValue = evaluate(node.left, vars)
      const rightValue = evaluate(node.right, vars)

      switch (node.operator) {
        case "+":
          return leftValue + rightValue
        case "-":
          return leftValue - rightValue
        case "*":
          return leftValue * rightValue
        case "/":
          return leftValue / rightValue
        case "%":
          return leftValue % rightValue
        case "==":
          return leftValue == rightValue
        case "===":
          return leftValue === rightValue
        case "!=":
          return leftValue != rightValue
        case "!==":
          return leftValue !== rightValue
        case "<":
          return leftValue < rightValue
        case "<=":
          return leftValue <= rightValue
        case ">":
          return leftValue > rightValue
        case ">=":
          return leftValue >= rightValue
        default:
          throw new FailureError(node)
      }
    case "Identifier":
      if (!(node.name in vars)) {
        throw new FailureError(node)
      }

      return vars[node.name]
    case "CallExpression":
      throw new FailureError(node)
    case "MemberExpression":
      const obj = evaluate(node.object, vars)

      if (node.property.type === "Identifier") {
        return obj[node.property.name]
      } else {
        const prop = evaluate(node.property, vars)
        return obj[prop]
      }
    case "ConditionalExpression":
      const testValue = evaluate(node.test, vars)
      return testValue
        ? evaluate(node.consequent, vars)
        : evaluate(node.alternate, vars)
    case "TemplateLiteral":
      return node.quasis.map((quasi) => quasi.value.cooked).join("")

    default:
      throw new FailureError(node)
  }
}
