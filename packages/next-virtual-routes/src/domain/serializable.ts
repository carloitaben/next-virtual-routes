type SerializableContextValue =
  | null
  | undefined
  | string
  | number
  | boolean
  | Date
  | ReadonlyArray<SerializableContextValue>
  | { readonly [key: string]: SerializableContextValue }

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertSerializableValue(
  value: unknown,
  path: string,
  seen: Set<object>,
): asserts value is SerializableContextValue {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return
  }

  if (value instanceof Date) {
    return
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertSerializableValue(item, `${path}[${index}]`, seen)
    }
    return
  }

  if (typeof value !== "object") {
    throw new Error(`Unsupported context value at ${path}: ${typeof value}`)
  }

  if (seen.has(value)) {
    throw new Error(`Context contains a cycle at ${path}`)
  }

  if (!isPlainObject(value)) {
    throw new Error(`Unsupported context object at ${path}`)
  }

  seen.add(value)

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw new Error(`Context contains a non-string key at ${path}`)
    }

    assertSerializableValue(
      Reflect.get(value, key),
      path === "context" ? `context.${key}` : `${path}.${key}`,
      seen,
    )
  }

  seen.delete(value)
}

export function assertContextSerializable(value: unknown): void {
  assertSerializableValue(value, "context", new Set<object>())
}
