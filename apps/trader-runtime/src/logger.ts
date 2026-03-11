export function logInfo(message: string, ...args: unknown[]): void {
  console.log(`[info] ${message}`, ...args);
}

export function logWarn(message: string, ...args: unknown[]): void {
  console.warn(`[warn] ${message}`, ...args);
}

export function logError(message: string, ...args: unknown[]): void {
  console.error(`[error] ${message}`, ...args);
}

export function logDebug(message: string, ...args: unknown[]): void {
  if (process.env.DEBUG !== 'true') {
    return;
  }

  console.log(`[debug] ${message}`, ...args);
}
