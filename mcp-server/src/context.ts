import { AsyncLocalStorage } from 'async_hooks'

export const apiKeyStore = new AsyncLocalStorage<string>()
