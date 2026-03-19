import { extname } from "node:path"

const CODE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
])

export function isCodeLikeFile(path: string): boolean {
  return CODE_EXTENSIONS.has(extname(path))
}

export function shouldTransformTemplate(
  templatePath: string,
  outputPath: string,
): boolean {
  return isCodeLikeFile(templatePath) && isCodeLikeFile(outputPath)
}
