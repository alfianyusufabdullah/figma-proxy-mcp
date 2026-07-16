const validApiKeys = new Set<string>()

export function addApiKey(key: string): void {
  validApiKeys.add(key)
}

export function isValidApiKey(key: string): boolean {
  return validApiKeys.has(key)
}
