/**
 * Logger utility — debug/info suppressed, errors always logged.
 * Terser strips console.* in production builds anyway.
 */

const ENABLE_LOGGING = false

const noop = () => {}

export const logger = {
  log: ENABLE_LOGGING ? (...a) => console.log(...a) : noop,
  info: ENABLE_LOGGING ? (...a) => console.info(...a) : noop,
  debug: ENABLE_LOGGING ? (...a) => console.debug(...a) : noop,
  warn: (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
}

export const criticalLogger = {
  error: (...a) => console.error('[CRITICAL]', ...a),
}
