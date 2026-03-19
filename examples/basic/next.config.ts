import { NextConfig } from "next"
import { route, withRoutes } from "next-virtual-routes"

const nextConfig: NextConfig = {
  /* config options here */
}

export default withRoutes({
  routes: [
    route("src/app/page.tsx", "src/templates/page.tsx"),
    route("src/app/shop/page.tsx", "src/templates/page.tsx"),
    route("src/app/blog/page.tsx", "src/templates/page.tsx"),
    route("src/app/blog/[...slug]/page.tsx", "src/templates/page.tsx"),
    route("src/app/about/page.tsx", "src/templates/page.tsx"),
  ],
  remove: ["src/app/**"],
})(nextConfig)
