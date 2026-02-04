import { RouteFilePath } from "next-virtual-routes"

/**
 * Here we can store any value in memory, using route file paths as keys.
 * This is useful for passing non-serializable values to templates.
 */
export type RouteContext = {
  date: Date
}

export const routeContext = new Map<RouteFilePath, RouteContext>()

export function getRouteContext(path: RouteFilePath) {
  const value = routeContext.get(path)

  if (!value) {
    throw Error("Unable to get route context.", {
      cause: path,
    })
  }

  return value
}
