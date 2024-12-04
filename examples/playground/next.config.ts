import { context, prefix, route, withRoutes } from "next-virtual-routes"

declare module "next-virtual-routes" {
  interface Context {
    foo?: string
    bar?: string
  }
}

export default withRoutes({
  routes: {
    formatter: "prettier",
    config: [
      ...prefix(
        "(context-merging)",
        context({ foo: "foo" }, [
          route("context/page.tsx", "src/templates/print.tsx"),
          ...context({ foo: "overriden", bar: "bar" }, [
            route("context/nested/page.tsx", "src/templates/print.tsx"),
            route("context/nested/deeply/page.tsx", "src/templates/print.tsx", {
              bar: "overriden",
            }),
          ]),
        ])
      ),
      // ...prefix("(duplicated-warning)", [
      //   route("duplicated/page.tsx", "src/templates/print.tsx"),
      //   route("duplicated/page.tsx", "src/templates/print.tsx"),
      // ]),
    ],
  },
})
