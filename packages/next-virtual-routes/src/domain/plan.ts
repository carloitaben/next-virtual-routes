import { resolve } from "node:path"
import type { Context } from "../lib"
import type { ResolvedRoutesConfig } from "./config"
import { DuplicateRoutePathError } from "./errors"

export type PlannedRoute = Readonly<{
  absoluteOutputPath: string
  absoluteTemplatePath: string
  outputPath: string
  routeContext: Context
  templatePath: string
}> 

export type RoutePlan = Readonly<{
  routes: ReadonlyArray<PlannedRoute>
  templatePaths: ReadonlyArray<string>
}>

function createRouteContext(
  outputPath: string,
  context: Context | undefined,
): Context {
  return {
    ...context,
    path: outputPath,
  }
}

export function buildRoutePlan(config: ResolvedRoutesConfig): RoutePlan {
  const seen = new Set<string>()
  const routes = config.routes.map((route) => {
    const absoluteOutputPath = resolve(config.cwd, route.path)

    if (seen.has(absoluteOutputPath)) {
      throw new DuplicateRoutePathError({ path: route.path })
    }

    seen.add(absoluteOutputPath)

    return {
      absoluteOutputPath,
      absoluteTemplatePath: resolve(config.cwd, route.template),
      outputPath: route.path,
      routeContext: createRouteContext(route.path, route.context),
      templatePath: route.template,
    }
  })

  return {
    routes,
    templatePaths: [...new Set(routes.map((route) => route.absoluteTemplatePath))],
  }
}
