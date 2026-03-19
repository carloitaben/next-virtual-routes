import { routeContext } from "@/lib/routes"
import { NextConfig } from "next"
import {
  Context,
  RouteFilePath,
  RouteTemplatePath,
  route,
  withRoutes,
} from "next-virtual-routes"

declare module "next-virtual-routes" {
  interface Context {
    path: RouteFilePath
  }
}

const nextConfig: NextConfig = {
  /* config options here */
}

function routeWithPath(
  path: RouteFilePath,
  template: RouteTemplatePath,
  context?: Context,
) {
  routeContext.set(path, {
    date: new Date(),
  })

  return route(path, template, { ...context, path })
}

export default withRoutes({
  routes: [
    routeWithPath("src/app/page.tsx", "src/templates/page.tsx"),
    routeWithPath("src/app/shop/page.tsx", "src/templates/page.tsx"),
    routeWithPath("src/app/blog/page.tsx", "src/templates/page.tsx"),
  ],
  remove: ["src/app/**"],
})(nextConfig)
