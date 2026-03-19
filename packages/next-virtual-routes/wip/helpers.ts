import { Route, type Context, type RouteFilePath } from "./config"

/**
 * Describes a route.
 *
 * @example Basic usage
 * ```ts
 * route("src/app/page.tsx", "src/templates/page.tsx"),
 * route("src/pages/dashboard/settings/username.tsx", "src/templates/dashboard.tsx"),
 * ```
 */
export function route(
  path: RouteFilePath,
  template: RouteFilePath,
  context?: Context,
) {
  return Route.make({
    context,
    path,
    template,
  })
}

/**
 * TODO: document
 *
 * @example Generating routes on the App Router
 * ```ts
 * prefix(
 *   "src/app/",
 *   route("page.tsx", "src/templates/page.tsx"),
 *   route("blog/page.tsx", "src/templates/page.tsx"),
 *   route("shop/page.tsx", "src/templates/page.tsx"),
 * )
 * ```
 */
export function prefix(prefix: string, ...routes: Route[]) {
  return routes.map((route) => ({
    ...route,
    path: prefix + route.path,
  }))
}

export function context(context: Context, ...routes: Route[]) {
  return routes.map((route) => ({
    ...route,
    context: {
      ...context,
      ...route.context,
    },
  }))
}
