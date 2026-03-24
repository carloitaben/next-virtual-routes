import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { NextConfig } from "next"
import prettier from "prettier"
import { route, withRoutes } from "next-virtual-routes"

const nextConfig: NextConfig = {
  /* config options here */
}

export default withRoutes({
  routes: [route("src/app/page.tsx", "src/templates/page.tsx")],
  remove: ["src/app/page.tsx"],
  hooks: {
    onRouteGenerated: async ({ path }) => {
      const filePath = resolve(process.cwd(), path)
      const source = await readFile(filePath, "utf8")
      const prettierConfig = await prettier.resolveConfig(filePath)
      const formatted = await prettier.format(source, {
        ...prettierConfig,
        filepath: filePath,
      })

      await writeFile(filePath, formatted)
    },
  },
})(nextConfig)
