import { defineConfig } from "tsup"
import { generateDocumentation } from "tsdoc-markdown"

generateDocumentation({
  inputFiles: ["./src/plugin.ts", "./src/lib.ts"],
  outputFile: "./README.md",
  buildOptions: {
    explore: false,
    types: true,
  },
  markdownOptions: {
    emoji: null,
    headingLevel: "###",
  },
})

export default defineConfig({
  outDir: "dist",
  entry: ["src/index.ts"],
  format: ["cjs"],
  splitting: false,
  sourcemap: false,
  clean: true,
  dts: true,
})
