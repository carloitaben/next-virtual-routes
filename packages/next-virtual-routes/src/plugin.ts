import type { NextConfig } from "next"
import { join } from "path"
import { readFile, writeFile, exists, ensureFile, emptydir } from "fs-extra"
import { createHash } from "crypto"
import type { Route, RouteContext } from "./lib.js"
import { debug } from "./util.js"
import { transform } from "./transform.js"

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

type PluginRoutesConfigObject = {
  config: RoutesDefinition
  cwd?: string
  cacheMaxAge?: number
  banner?: string[]
  strict?: boolean
  formatter?: "prettier"
  formatterConfigFile?: string
}

type PluginRoutesConfig = RoutesDefinition | PluginRoutesConfigObject

type RouteTree = Record<
  string,
  {
    [K: string]: RouteTree
  }
>

// @ts-expect-error TODO: do something with maxAg
async function isCached(routes: Route[], maxAge: number) {
  const hashPath = join(process.cwd(), ".next/next-virtual-routes/.cache")

  debug(`ensuring cache file at ${hashPath}`)
  await ensureFile(hashPath)

  // @ts-expect-error
  const lastHash = await readFile(hashPath, {
    encoding: "hex",
  })

  const hashContent = JSON.stringify(
    routes.sort((a, b) => (a.path > b.path ? 1 : -1))
  )

  const hash = createHash("sha1").update(hashContent).digest("hex")

  // if (lastHash === hash) {
  //   debug("cache HIT. Skipping route generation")
  //   return true
  // }

  debug("Writing cache hash")
  writeFile(hashPath, hash, {
    encoding: "hex",
  })

  return false
}

async function getAppDirectory() {
  const withSrc = join(process.cwd(), "src/app")
  const withSrcExists = await exists(withSrc)

  if (withSrcExists) {
    return withSrc
  }

  const withoutSrc = join(process.cwd(), "app")
  const withoutSrcExists = await exists(withoutSrc)

  if (withoutSrcExists) {
    return withoutSrc
  }

  throw Error("TODO: no hi ha app dir")
}

const configDefaults = {
  cwd: process.cwd(),
  cacheMaxAge: Infinity,
  config: [],
  strict: false,
} satisfies PluginRoutesConfigObject

async function resolveConfig(config: PluginRoutesConfig) {
  if (Array.isArray(config)) {
    return {
      ...configDefaults,
      routes: config,
    }
  }

  if (typeof config === "function") {
    const routes = await config()
    return {
      ...configDefaults,
      routes,
    }
  }

  const routes =
    typeof config.config === "function" ? await config.config() : config.config

  return {
    ...configDefaults,
    ...config,
    routes,
  }
}

async function getFormatter(config: PluginRoutesConfigObject) {
  const formatterConfig = config.formatterConfigFile
    ? await readFile(config.formatterConfigFile, { encoding: "utf-8" }).then(
        (file) => JSON.parse(file)
      )
    : undefined

  switch (config.formatter) {
    case "prettier":
      const prettier = await import("prettier")
      return function format(source: string) {
        return prettier.format(source, {
          parser: "typescript",
          ...formatterConfig,
        })
      }
    default:
      return function format(source: string) {
        return source
      }
  }
}

export async function generateRoutes(config: PluginRoutesConfig) {
  debug("called generateRoutes()")
  debug("resolving routes config")

  const routesConfig = await resolveConfig(config)

  if (!routesConfig.routes.length) {
    console.warn("TODO: warn routes is empty")
    return
  }

  // const cached = await isCached(routesConfig.routes, routesConfig.cacheMaxAge)

  // if (cached) {
  //   debug("Reusing cache")
  //   return
  // }

  const now = new Date().getTime()
  const appDirectory = await getAppDirectory()
  const format = await getFormatter(routesConfig)

  debug("cache MISS. Cleaning virtual directory")
  await emptydir(appDirectory)
  debug("starting route generation")

  const tree: RouteTree = {}

  const promises = routesConfig.routes.map(async (route) => {
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
      return console.warn(`TODO: warn existing fs route "${route.path}"`)
    }

    const virtualRoutePath = join(appDirectory, route.path)

    const context: RouteContext = {
      filename: virtualRoutePath,
      context: route.context,
    }

    debug(`writing virtual route at ${virtualRoutePath}`)
    await ensureFile(virtualRoutePath)
    const templateCode = await readFile(templatePath, "utf-8")

    if (!templateCode) {
      return console.warn("TODO: empty tempalte file")
    }

    const transformed = transform(templateCode, context)
    const formatted = await format(transformed)
    await writeFile(virtualRoutePath, formatted)
    debug(`created virtual route at ${virtualRoutePath}`)

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
  console.log("app")
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
