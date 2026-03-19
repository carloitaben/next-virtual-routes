import { NextConfig } from "next"
import { context, prefix, route, withRoutes } from "next-virtual-routes"

declare module "next-virtual-routes" {
  interface Context {
    language: string
  }
}

const nextConfig: NextConfig = {
  /* config options here */
}

export default withRoutes({
  routes: [
    ...prefix(
      "src/app/(en)/",
      ...context(
        { language: "en" },
        route("layout.tsx", "src/templates/layout.tsx"),
        route("home/page.tsx", "src/templates/page.tsx"),
        route("blog/page.tsx", "src/templates/page.tsx"),
      ),
    ),
    ...prefix(
      "src/app/en",
      ...context(
        { language: "en" },
        route("layout.tsx", "src/templates/layout.tsx"),
        route("home/page.tsx", "src/templates/page.tsx"),
        route("blog/page.tsx", "src/templates/page.tsx"),
      ),
    ),
    ...prefix(
      "src/app/es",
      ...context(
        { language: "es" },
        route("layout.tsx", "src/templates/layout.tsx"),
        route("inicio/page.tsx", "src/templates/page.tsx"),
        route("blog/page.tsx", "src/templates/page.tsx"),
      ),
    ),
  ],
  remove: ["src/app/**"],
})(nextConfig)
