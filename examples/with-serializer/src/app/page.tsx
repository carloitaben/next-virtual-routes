const context = {
  "serialized": "[{\"date\":1},[\"Date\",\"1970-01-01T00:00:00.000Z\"]]"
}

import { parse } from "devalue"
import { Context } from "next-virtual-routes"

const deserialized = parse(
  context.serialized,
) as Required<Context>["deserialized"]

export default function Page() {
  return (
    <html>
      <body>
        {deserialized.date instanceof Date ? "It's a date!" : "Not a date"}
      </body>
    </html>
  )
}
