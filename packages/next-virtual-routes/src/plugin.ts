import type { NextConfig } from "next"
import { join } from "path"
import { watch } from "chokidar"
import { glob } from "fast-glob"
import { readFile, writeFile, exists, ensureFile, unlink } from "fs-extra"
import { createHash } from "crypto"
import type { Route } from "./lib.js"
import { debug, hash } from "./util.js"
import { transform } from "./transform.js"
import { event, fail, wait, warn } from "./log.js"

type RouteTree = Record<
  string,
  {
    [K: string]: RouteTree
  }
>

/**
 * TODO: document
 */
export type RoutesDefinition = Route[] | (() => Route[] | Promise<Route[]>)

/**
 * TODO: document
 */
export type RoutesPluginConfig = {
  config: RoutesDefinition
  banner?: string[]
  footer?: string[]
  cwd?: string
  log?: boolean
  cache?: boolean
  watch?: boolean
  cacheFile?: string
  formatter?: "prettier"
  clearFiles?: string[]
  formatterConfigFile?: string
}

type NextConfigWithRoutesPlugin = NextConfig & {
  routes: RoutesDefinition | RoutesPluginConfig
}

const configDefaults = {
  cwd: process.cwd(),
  log: true,
  cache: true,
  watch: !process.env.CI,
  clearFiles: [],
  banner: [],
  footer: [],
  cacheFile: ".next/next-virtual-routes/cache",
  config: [],
} satisfies RoutesPluginConfig

function printTree(tree: any, prefix: string = ""): void {
  const keys = Object.keys(tree)
  keys.forEach((key, index) => {
    const isLastKey = index === keys.length - 1
    const connector = isLastKey ? "└── " : "├── "
    console.log(`${prefix}${connector}${key}`)
    printTree(tree[key], `${prefix}${isLastKey ? "    " : "│   "}`)
  })
}

async function getAppDirectory(config: ResolvedConfig) {
  const withSrc = join(config.cwd, "src/app")
  const withSrcExists = await exists(withSrc)

  if (withSrcExists) {
    return withSrc
  }

  const withoutSrc = join(config.cwd, "app")
  const withoutSrcExists = await exists(withoutSrc)

  if (withoutSrcExists) {
    return withoutSrc
  }

  throw Error("TODO: no hi ha app dir")
}

async function resolveConfig(config: NextConfigWithRoutesPlugin["routes"]) {
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

type ResolvedConfig = Awaited<ReturnType<typeof resolveConfig>>

async function getFormatter(config: ResolvedConfig) {
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

async function generateRoute(
  route: Route,
  {
    tree,
    config,
    format,
    appDirectory,
  }: {
    tree?: RouteTree
    appDirectory: string
    config: ResolvedConfig
    format: Awaited<ReturnType<typeof getFormatter>>
  }
) {
  debug(`processing route ${JSON.stringify(route)}`)

  const templatePath = join(process.cwd(), route.template)
  const templateExists = await exists(templatePath)

  if (!templateExists) {
    fail(`Missing template ${templatePath}`)
    process.exit(1)
  }

  const fsRoutePath = join(process.cwd(), route.path)
  const fsRouteExist = await exists(fsRoutePath)

  if (fsRouteExist) {
    return warn(`TODO: warn existing fs route "${route.path}"`)
  }

  const virtualRoutePath = join(appDirectory, route.path)

  debug(`writing virtual route at ${virtualRoutePath}`)
  await ensureFile(virtualRoutePath)
  const templateCode = await readFile(templatePath, "utf-8")

  if (!templateCode) {
    warn(`Using empty template file ${route.template}`)
  }

  const transformed = transform(templateCode, {
    routeContext: route.context,
    banner: config.banner,
    footer: config.footer,
  })

  const formatted = await format(transformed)
  await writeFile(virtualRoutePath, formatted)
  debug(`created virtual route at ${virtualRoutePath}`)

  if (tree) {
    const segments = route.path.split("/")
    let currentLevel = tree

    segments.forEach((segment) => {
      if (!currentLevel[segment]) {
        currentLevel[segment] = {}
      }

      currentLevel = currentLevel[segment]
    })
  }

  return route
}

/**
 * TODO: document
 */
export async function generateRoutes(
  config: NextConfigWithRoutesPlugin["routes"]
) {
  const timeout = setTimeout(() => wait("Generating routes ..."), 500)

  debug("called generateRoutes()")
  debug("resolving routes config")

  const routesConfig = await resolveConfig(config)
  const cacheFilePath = join(routesConfig.cwd, routesConfig.cacheFile)

  debug(`ensuring cache file at ${cacheFilePath}`)
  await ensureFile(cacheFilePath)

  const cacheHash = createHash("sha1")
    .update(hash(routesConfig))
    .digest("binary")

  const lastCacheHash = await readFile(cacheFilePath, { encoding: "binary" })

  if (cacheHash === lastCacheHash && routesConfig.cache) {
    debug("cache HIT")
    return clearTimeout(timeout)
  }

  const now = new Date().getTime()
  const appDirectory = await getAppDirectory(routesConfig)
  const format = await getFormatter(routesConfig)

  debug("cache MISS")

  if (routesConfig.clearFiles.length) {
    const paths = routesConfig.clearFiles.map((file) =>
      join(appDirectory, file)
    )

    const files = await glob(paths)

    await Promise.all(
      files.map(async (file) => {
        debug(`clearing file ${file}`)
        await unlink(file)
      })
    )
  }

  const tree: RouteTree = {}

  const promises = routesConfig.routes.map(async (route) => {
    const generateRouteFunction = generateRoute.bind(null, route, {
      config: routesConfig,
      appDirectory,
      format,
      tree,
    })

    await generateRouteFunction()

    if (routesConfig.watch) {
      debug(`watching template file ${route.template}`)
      const watcher = watch(route.template, {
        ignoreInitial: true,
      })

      watcher.on("change", async () => {
        debug(`detected change on template file ${route.template}`)
        await generateRouteFunction()
      })
    }
  })

  debug("starting route generation")
  const result = await Promise.all(promises).then((results) =>
    results.filter((result) => typeof result !== "undefined")
  )

  debug("route generation finished")
  debug("caching result")
  await writeFile(cacheFilePath, cacheHash, {
    encoding: "binary",
  })

  clearTimeout(timeout)

  if (routesConfig.log) {
    debug("printing result")
    const end = new Date().getTime()

    console.log("")
    event(`Generated ${result.length} virtual routes in ${end - now}ms`)
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
}: NextConfigWithRoutesPlugin): Promise<NextConfig> {
  debug("running Next.js plugin")
  await generateRoutes(routes)
  return nextConfig
}
