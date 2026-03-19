import { NextConfig } from "next"
import { route, withRoutes } from "next-virtual-routes"

const nextConfig: NextConfig = {
  /* config options here */
}

export default withRoutes({
  routes: [
    route("src/pages/index.tsx", "src/templates/page.tsx"),
    route("src/pages/docs.tsx", "src/templates/page.tsx"),
    route("src/pages/blog/[slug].tsx", "src/templates/page.tsx"),
  ],
  remove: ["src/pages/**"],
})(nextConfig)
