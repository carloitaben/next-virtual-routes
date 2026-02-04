import { getRouteContext } from "@/lib/routes"

const routeContext = getRouteContext(context.path)

export default function Page() {
  return (
    <html>
      <body>
        {routeContext.date instanceof Date ? "It's a date!" : "Not a date"}
      </body>
    </html>
  )
}
