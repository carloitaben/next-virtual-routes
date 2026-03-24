import { fileURLToPath } from "url"
import { automd } from "automd"
import { defineConfig } from "tsdown"

const packageDir = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  inputOptions: {
    resolve: {},
  },
  hooks: {
    "build:done": async () => {
      await automd({
        dir: packageDir,
        input: "README.md",
      })
    },
  },
})
