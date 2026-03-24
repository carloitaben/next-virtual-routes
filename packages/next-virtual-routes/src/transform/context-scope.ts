import { visitorKeys } from "oxc-parser"
import type {
  BindingPattern,
  Directive,
  Function,
  FunctionBody,
  IdentifierName,
  Node,
  Program,
  Statement,
  VariableDeclaration,
} from "@oxc-project/types"

export const GLOBAL_IDENTIFIER = "context"

type Scope = Set<string>
type ScopeStack = ReadonlyArray<Scope>
type BindingScopeNode = Program | FunctionBody

type VisitorCallbacks = Readonly<{
  enter?: (node: Node, parent: Node | undefined, scopes: ScopeStack) => void
  exit?: (node: Node, parent: Node | undefined, scopes: ScopeStack) => void
}>

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null
}

function isNode(value: unknown): value is Node {
  return isRecord(value) && typeof value["type"] === "string"
}

function createScope(): Scope {
  return new Set<string>()
}

function isBound(scopes: ScopeStack, name: string): boolean {
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const scope = scopes[index]
    if (scope?.has(name)) {
      return true
    }
  }

  return false
}

function bindName(scope: Scope, name: string): void {
  scope.add(name)
}

function bindPattern(pattern: BindingPattern, scope: Scope): void {
  switch (pattern.type) {
    case "Identifier":
      bindName(scope, pattern.name)
      return
    case "ArrayPattern":
      for (const element of pattern.elements) {
        if (!element) {
          continue
        }

        if (element.type === "RestElement") {
          bindPattern(element.argument, scope)
          continue
        }

        bindPattern(element, scope)
      }
      return
    case "AssignmentPattern":
      bindPattern(pattern.left, scope)
      return
    case "ObjectPattern":
      for (const property of pattern.properties) {
        if (property.type === "RestElement") {
          bindPattern(property.argument, scope)
          continue
        }

        bindPattern(property.value, scope)
      }
      return
  }
}

function bindParameter(parameter: Function["params"][number], scope: Scope): void {
  switch (parameter.type) {
    case "Identifier":
    case "ArrayPattern":
    case "AssignmentPattern":
    case "ObjectPattern":
      bindPattern(parameter, scope)
      return
    case "RestElement":
      bindPattern(parameter.argument, scope)
      return
    case "TSParameterProperty":
      bindPattern(parameter.parameter, scope)
      return
  }
}

function bindVariableDeclaration(declaration: VariableDeclaration, scope: Scope): void {
  for (const declarator of declaration.declarations) {
    bindPattern(declarator.id, scope)
  }
}

function bindStatement(statement: Directive | Statement, scope: Scope): void {
  switch (statement.type) {
    case "ClassDeclaration":
      if (statement.id) {
        bindName(scope, statement.id.name)
      }
      return
    case "ExportNamedDeclaration":
      if (!statement.declaration) {
        return
      }

      if (statement.declaration.type === "VariableDeclaration") {
        bindVariableDeclaration(statement.declaration, scope)
      }

      if ((statement.declaration.type === "FunctionDeclaration"
        || statement.declaration.type === "ClassDeclaration") && statement.declaration.id) {
        bindName(scope, statement.declaration.id.name)
      }
      return
    case "FunctionDeclaration":
      if (statement.id) {
        bindName(scope, statement.id.name)
      }
      return
    case "ImportDeclaration":
      for (const specifier of statement.specifiers) {
        bindName(scope, specifier.local.name)
      }
      return
    case "VariableDeclaration":
      bindVariableDeclaration(statement, scope)
      return
    default:
      return
  }
}

function bindBlockScope(node: BindingScopeNode, scope: Scope): void {
  for (const statement of node.body) {
    bindStatement(statement, scope)
  }
}

function pushScope(scopes: Array<Scope>, prefill?: (scope: Scope) => void): void {
  const scope = createScope()
  prefill?.(scope)
  scopes.push(scope)
}

function popScope(scopes: Array<Scope>): void {
  scopes.pop()
}

function walkNode(
  node: Node,
  parent: Node | undefined,
  scopes: Array<Scope>,
  callbacks: VisitorCallbacks,
): void {
  callbacks.enter?.(node, parent, scopes)

  const keys = visitorKeys[node.type] ?? []
  for (const key of keys) {
    const value = (node as unknown as Record<string, unknown>)[key]

    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) {
          walkNode(child, node, scopes, callbacks)
        }
      }
      continue
    }

    if (isNode(value)) {
      walkNode(value, node, scopes, callbacks)
    }
  }

  callbacks.exit?.(node, parent, scopes)
}

function isIdentifierNode(node: Node): node is IdentifierName {
  return node.type === "Identifier" && typeof node.name === "string"
}

function isReferenceIdentifier(node: IdentifierName, parent: Node | undefined): boolean {
  if (!parent) {
    return false
  }

  switch (parent.type) {
    case "ArrayPattern":
    case "BreakStatement":
    case "ContinueStatement":
    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier":
    case "ImportSpecifier":
    case "LabeledStatement":
      return false
    case "AssignmentPattern":
      return parent.left !== node
    case "CatchClause":
      return parent.param !== node
    case "ClassDeclaration":
    case "ClassExpression":
      return parent.id !== node
    case "ExportSpecifier":
      return false
    case "FunctionDeclaration":
    case "FunctionExpression":
      return parent.id !== node
    case "MemberExpression":
      return parent.computed || parent.object === node
    case "MetaProperty":
      return false
    case "MethodDefinition":
      return false
    case "ObjectPattern":
      return false
    case "Property":
      if (parent.value === node) {
        return true
      }

      return parent.computed
    case "RestElement":
      return false
    case "TSParameterProperty":
      return false
    case "VariableDeclarator":
      return parent.init === node
    default:
      return true
  }
}

export function hasGlobalContextReference(program: Program): boolean {
  const scopes: Array<Scope> = []
  let hasGlobalContext = false

  walkNode(program, undefined, scopes, {
    enter(node, parent, currentScopes) {
      switch (node.type) {
        case "Program":
          pushScope(scopes, (scope) => bindBlockScope(node, scope))
          return
        case "BlockStatement":
          pushScope(scopes, (scope) => bindBlockScope(node, scope))
          return
        case "FunctionDeclaration":
        case "FunctionExpression":
        case "ArrowFunctionExpression":
          pushScope(scopes, (scope) => {
            if (node.type !== "ArrowFunctionExpression" && node.id) {
              bindName(scope, node.id.name)
            }

            for (const parameter of node.params) {
              bindParameter(parameter, scope)
            }
          })
          return
        case "ClassDeclaration":
        case "ClassExpression":
          pushScope(scopes, (scope) => {
            if (node.id) {
              bindName(scope, node.id.name)
            }
          })
          return
        case "CatchClause":
          pushScope(scopes, (scope) => {
            if (node.param) {
              bindPattern(node.param, scope)
            }
          })
          return
        case "Identifier":
          if (!isIdentifierNode(node)) {
            return
          }

          if (
            node.name === GLOBAL_IDENTIFIER
            && isReferenceIdentifier(node, parent)
            && !isBound(currentScopes, node.name)
          ) {
            hasGlobalContext = true
          }
          return
        default:
          return
      }
    },
    exit(node) {
      switch (node.type) {
        case "ArrowFunctionExpression":
        case "BlockStatement":
        case "CatchClause":
        case "ClassDeclaration":
        case "ClassExpression":
        case "FunctionDeclaration":
        case "FunctionExpression":
        case "Program":
          popScope(scopes)
          return
        default:
          return
      }
    },
  })

  return hasGlobalContext
}
