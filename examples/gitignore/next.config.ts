import { prefix, route, withRoutes } from "next-virtual-routes"

export default withRoutes({
  routes: {
    banner: [
      "// This file was automatically generated.",
      "// You should NOT make any changes in this file as it will be overwritten.",
      "// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.",
      "",
    ],
    config: prefix("(virtual)", [
      route("shop/page.tsx", "src/templates/page.tsx"),
      route("blog/page.tsx", "src/templates/page.tsx"),
      route("blog/[...slug]/page.tsx", "src/templates/page.tsx"),
      route("about/page.tsx", "src/templates/page.tsx"),
    ]),
  },
})
