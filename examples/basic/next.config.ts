import { route, withRoutes } from "next-virtual-routes"

export default withRoutes({
  routes: [
    route("page.tsx", "src/templates/page.tsx"),
    route("shop/page.tsx", "src/templates/page.tsx"),
    route("blog/page.tsx", "src/templates/page.tsx"),
    route("blog/[...slug]/page.tsx", "src/templates/page.tsx"),
    route("about/page.tsx", "src/templates/page.tsx"),
  ],
})
