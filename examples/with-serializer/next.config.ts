import { Context, route, withRoutes } from "next-virtual-routes"
import { stringify } from "devalue"

declare module "next-virtual-routes" {
  interface Context {
    serialized: string
    deserialized?: {
      date: Date
    }
  }
}

export default withRoutes({
  routes: () => {
    const context = stringify({
      date: new Date(0),
    } satisfies Context["deserialized"])

    return [
      route("page.tsx", "src/templates/page.tsx", {
        serialized: context,
      }),
    ]
  },
})
