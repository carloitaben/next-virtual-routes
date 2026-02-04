import { NextConfig } from "next"
import { prefix, route, withRoutes } from "next-virtual-routes"

const nextConfig: NextConfig = {
  /* config options here */
}

export default withRoutes(nextConfig, {
  routes: prefix(
    "src/app/(generated)/",
    route("page.tsx", "src/templates/page.tsx"),
    route("shop/page.tsx", "src/templates/page.tsx"),
    route("blog/page.tsx", "src/templates/page.tsx"),
    route("blog/[...slug]/page.tsx", "src/templates/page.tsx"),
    route("about/page.tsx", "src/templates/page.tsx"),
  ),
  remove: ["(generated)/**"],
})
