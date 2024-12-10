import { context, prefix, route, withRoutes } from "next-virtual-routes"

declare module "next-virtual-routes" {
  interface Context {
    language: string
  }
}

export default withRoutes({
  routes: [
    ...prefix(
      "(en)",
      context({ language: "en" }, [
        route("layout.tsx", "src/templates/layout.tsx"),
        route("home/page.tsx", "src/templates/page.tsx"),
        route("blog/page.tsx", "src/templates/page.tsx"),
      ]),
    ),
    ...prefix(
      "en",
      context({ language: "en" }, [
        route("layout.tsx", "src/templates/layout.tsx"),
        route("home/page.tsx", "src/templates/page.tsx"),
        route("blog/page.tsx", "src/templates/page.tsx"),
      ]),
    ),
    ...prefix(
      "es",
      context({ language: "es" }, [
        route("layout.tsx", "src/templates/layout.tsx"),
        route("inicio/page.tsx", "src/templates/page.tsx"),
        route("blog/page.tsx", "src/templates/page.tsx"),
      ]),
    ),
  ],
})
