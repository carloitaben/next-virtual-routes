function debugValue(): string | undefined {
  const value = process.env.DEBUG?.trim()
  return value && value.length > 0 ? value : undefined
}

export function isDebugEnabled(): boolean {
  const value = debugValue()

  if (!value) {
    return false
  }

  if (value === "1" || value === "true" || value === "*") {
    return true
  }

  return value.split(",").map((part) => part.trim()).includes("next-virtual-routes")
}
