import { resolve } from "node:path"
import { resolveContext, type Context } from "../lib"
import type { ResolvedRoutesConfig } from "./config"

export type PlannedRoute = Readonly<{
  absoluteOutputPath: string
  absoluteTemplatePath: string
  outputPath: string
  routeContext: Context
  templatePath: string
}> 

export type RoutePlanWarning = Readonly<{
  _tag: "DuplicateRoutePathWarning"
  keptTemplatePath: string
  path: string
  skippedTemplatePath: string
}>

export type RoutePlan = Readonly<{
  routes: ReadonlyArray<PlannedRoute>
  templatePaths: ReadonlyArray<string>
  warnings: ReadonlyArray<RoutePlanWarning>
}>

function createRouteContext(
  outputPath: string,
  context: Context | undefined,
): Context {
  return resolveContext({
    ...context,
    path: outputPath,
  })
}

export function buildRoutePlan(config: ResolvedRoutesConfig): RoutePlan {
  const warnings: Array<RoutePlanWarning> = []
  const routesByOutputPath = new Map<string, PlannedRoute>()

  for (const route of config.routes) {
    const absoluteOutputPath = resolve(config.cwd, route.path)
    const existingRoute = routesByOutputPath.get(absoluteOutputPath)

    if (existingRoute) {
      warnings.push({
        _tag: "DuplicateRoutePathWarning",
        keptTemplatePath: existingRoute.templatePath,
        path: route.path,
        skippedTemplatePath: route.template,
      })
      continue
    }

    routesByOutputPath.set(absoluteOutputPath, {
      absoluteOutputPath,
      absoluteTemplatePath: resolve(config.cwd, route.template),
      outputPath: route.path,
      routeContext: createRouteContext(route.path, route.context),
      templatePath: route.template,
    })
  }

  const routes = [...routesByOutputPath.values()]

  return {
    routes,
    templatePaths: [...new Set(routes.map((route) => route.absoluteTemplatePath))],
    warnings,
  }
}
