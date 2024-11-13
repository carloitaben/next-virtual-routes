import type { NextConfig } from "next"
import { join } from "path"
import {
  ensureDir,
  readFile,
  writeFile,
  exists,
  ensureFile,
  emptydir,
} from "fs-extra"
import { createHash } from "crypto"
// import { parse } from "acorn"
// import { walk } from "estree-walker"
// import MagicString from "magic-string"
// import { analyze } from "periscopic"
import type { Route } from "./lib.js"
import { debug } from "./util.js"
// import * as babelTypes from "@babel/types"
// import generate from "@babel/generator"

function printTree(tree: any, prefix: string = ""): void {
  const keys = Object.keys(tree)
  keys.forEach((key, index) => {
    const isLastKey = index === keys.length - 1
    const connector = isLastKey ? "└── " : "├── "
    console.log(`${prefix}${connector}${key}`)
    printTree(tree[key], `${prefix}${isLastKey ? "    " : "│   "}`)
  })
}

type RoutesDefinition = Route[] | (() => Route[] | Promise<Route[]>)

type PluginRoutesConfig = {
  routes: RoutesDefinition
}

// function evaluateExpression(node) {
//   if (node.type === "Literal") {
//     return node.value // Return the literal value
//   } else if (node.type === "BinaryExpression") {
//     const left = evaluateExpression(node.left)
//     const right = evaluateExpression(node.right)
//     switch (node.operator) {
//       case "+":
//         return left + right
//       case "-":
//         return left - right
//       case "*":
//         return left * right
//       case "/":
//         return left / right
//       case "===":
//         return left === right
//       default:
//         return null // Unsupported operator
//     }
//   }
//   return null // Handle other cases (UnaryExpression, CallExpression, etc.)
// }

type RouteTree = Record<
  string,
  {
    [K: string]: RouteTree
  }
>

export async function generateRoutes(routes: RoutesDefinition) {
  debug("called generateRoutes()")
  debug("resolving routes config")

  // TODO: use the resolved routes thing as a cache hash to prevent rerunning it during development
  const routesConfig = typeof routes === "function" ? await routes() : routes

  if (!routesConfig.length) {
    console.warn("TODO: warn routes is empty")
    return
  }

  const generatedRoutesDirectory = join(process.cwd(), "src/app/(virtual)")
  debug(`ensuring virtual directory at ${generatedRoutesDirectory}`)
  await ensureDir(generatedRoutesDirectory)

  const hashPath = join(generatedRoutesDirectory, ".cache")
  debug(`ensuring cache file at ${hashPath}`)
  await ensureFile(hashPath)

  const lastHash = await readFile(hashPath, { encoding: "hex" })
  const hashContent = JSON.stringify(
    routesConfig.sort((a, b) => (a.path > b.path ? 1 : -1))
  )

  const hash = createHash("sha1").update(hashContent).digest("hex")

  if (lastHash === hash) {
    debug("cache HIT. Skipping route generation")
    return
  }

  const now = new Date().getTime()

  debug("cache MISS. Cleaning virtual directory")
  emptydir(generatedRoutesDirectory)

  debug("Writing cache hash")
  writeFile(hashPath, hash, { encoding: "hex" })

  debug("starting route generation")

  const tree: RouteTree = {}

  // TODO: accumulate promises instead of mapping
  // - we can then skip the filtering of voids for counting routes
  // - we can check if two routes are pointing to the same path
  const promises = routesConfig.map(async (route) => {
    debug(`processing route ${JSON.stringify(route)}`)

    if (route.path.startsWith("/")) {
      console.warn("TODO: no pending slashes")
      route.path.substring(1)
    }

    const templatePath = join(process.cwd(), route.template)
    const templateExists = await exists(templatePath)

    if (!templateExists) {
      throw Error(`TODO: missing template ${templatePath}`)
    }

    const fsRoutePath = join(process.cwd(), route.path)
    const fsRouteExist = await exists(fsRoutePath)

    if (fsRouteExist) {
      console.warn(`TODO: warn existing fs route "${route.path}"`)
      return
    }

    const virtualRoutePath = join(generatedRoutesDirectory, route.path)

    const routeContext = {
      filename: virtualRoutePath,
      context: route.context,
    }

    debug(`writing virtual route at ${virtualRoutePath}`)
    await ensureFile(virtualRoutePath)
    const templateCode = await readFile(templatePath, "utf-8")
    // TODO: (AST) only inject route context if route global is accessed in `templateCode`
    // TODO: (AST) inject route context after imports to make generated files less ugly

    const template = [
      `const route = ${JSON.stringify(routeContext)}`,
      templateCode,
    ].join("\n")

    // TODO: (AST) statically analyze and evaluate AOT `route` global usage on `template`

    await writeFile(virtualRoutePath, template)
    debug(`created virtual route at ${virtualRoutePath}`)

    // const magicString = new MagicString(templateCode)

    // const ast = parse(templateCode, {
    //   ecmaVersion: "latest",
    //   locations: true,
    // })

    // const analyzed = analyze(ast)

    // console.log(analyzed)

    // walk(ast, {
    //   enter(node, parent) {
    //     if (node.type === "Identifier" && node.name === "$context") {
    //       const start = node.start
    //       const end = node.end

    //       // If $context is part of a conditional expression
    //       if (parent.type === "ConditionalExpression") {
    //         const condition = evaluateExpression(parent.test)
    //         const replacement = condition ? '"baz"' : '"qux"'
    //         magicString.overwrite(parent.start, parent.end, replacement)
    //       } else {
    //         // Replace the identifier with its value
    //         magicString.overwrite(start, end, `"${contextValue}"`)
    //       }
    //     }
    //   },
    // })

    // const resolveContextReferences = (node) => {
    //   if (babelTypes.isIdentifier(node) && node.name === "$context") {
    //     // Replace $context with the actual value based on the context
    //     return babelTypes.valueToNode(contextValue.value)
    //   }
    //   return node
    // }

    // // Traverse the AST to find and replace global $context
    // const traverseAndReplace = (node) => {
    //   traverse(node, {
    //     Identifier(path) {
    //       if (path.node.name === "$context") {
    //         // Check if $context is a global variable
    //         const isGlobal = path.scope.hasOwnBinding("$context") === false // Check if it's a global binding
    //         if (isGlobal) {
    //           path.replaceWith(resolveContextReferences(path.node))
    //         }
    //       }
    //     },
    //   })
    // }

    // // Start traversing from the root AST node
    // traverseAndReplace(ast)

    // tree things
    const segments = route.path.split("/")
    let currentLevel = tree

    segments.forEach((segment) => {
      if (!currentLevel[segment]) {
        currentLevel[segment] = {}
      }

      currentLevel = currentLevel[segment]
    })

    return route
  })

  const result = await Promise.all(promises).then((results) =>
    results.filter((result) => typeof result !== "undefined")
  )

  const end = new Date().getTime()

  console.log("")
  // TODO: make this check green like nextjs does
  console.log(` ✓ Generated ${result.length} virtual routes in ${end - now}ms`)
  console.log("")
  console.log("(virtual)")
  printTree(tree)
  console.log("")
}

export async function withRoutes({
  routes,
  ...nextConfig
}: PluginRoutesConfig & NextConfig): Promise<NextConfig> {
  await generateRoutes(routes)
  return nextConfig
}
