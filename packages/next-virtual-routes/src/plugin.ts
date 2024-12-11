import type { NextConfig } from "next"
import { join } from "path"
import { readFile, writeFile, exists, ensureFile, emptydir } from "fs-extra"
import { createHash } from "crypto"
import type { Route } from "./lib.js"
import { debug } from "./util.js"
import { transform } from "./transform.js"

type RouteTree = Record<
  string,
  {
    [K: string]: RouteTree
  }
>

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

type PluginConfigObject = {
  config: RoutesDefinition
  banner?: string[]
  footer?: string[]
  cwd?: string
  log?: boolean
  cache?: boolean
  cacheFile?: string
  formatter?: "prettier"
  formatterConfigFile?: string
}

type PluginConfig = NextConfig & {
  routes: RoutesDefinition | PluginConfigObject
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
  log: true,
  cache: true,
  banner: [],
  footer: [],
  cacheFile: ".next/next-virtual-routes/cache",
  config: [],
} satisfies PluginConfigObject

async function resolveConfig(config: PluginConfig["routes"]) {
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

async function getFormatter(config: PluginConfigObject) {
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

/**
 * TODO: document
 */
export async function generateRoutes(config: PluginConfig["routes"]) {
  debug("called generateRoutes()")
  debug("resolving routes config")

  const routesConfig = await resolveConfig(config)
  const cacheFilePath = join(routesConfig.cwd, routesConfig.cacheFile)

  await ensureFile(cacheFilePath)

  const cacheHash = createHash("sha1")
    .update(JSON.stringify(routesConfig.routes))
    .digest("hex")

  const lastCacheHash = await readFile(cacheFilePath, { encoding: "hex" })

  if (cacheHash === lastCacheHash && routesConfig.cache) {
    debug("Cache HIT")
    return
  }

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

    debug(`writing virtual route at ${virtualRoutePath}`)
    await ensureFile(virtualRoutePath)
    const templateCode = await readFile(templatePath, "utf-8")

    if (!templateCode) {
      return console.warn("TODO: empty tempalte file")
    }

    const transformed = transform(templateCode, {
      routeContext: route.context,
      banner: routesConfig.banner,
      footer: routesConfig.footer,
    })

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

  await writeFile(cacheFilePath, cacheHash, {
    encoding: "hex",
  })

  const end = new Date().getTime()

  if (routesConfig.log) {
    console.log("")
    // TODO: make this check green like nextjs does
    console.log(
      ` ✓ Generated ${result.length} virtual routes in ${end - now}ms`
    )
    console.log("")
    console.log("app")
    printTree(tree)
    console.log("")
  }
}

/**
 * TODO: document
 */
export async function withRoutes({
  routes,
  ...nextConfig
}: PluginConfig): Promise<NextConfig> {
  await generateRoutes(routes)
  return nextConfig
}
