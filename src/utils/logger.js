/**
 * Logger utility — debug/info suppressed, errors always logged.
 * Terser strips console.* in production builds anyway.
 */

const ENABLE_LOGGING = false

const noop = () => {}

export const logger = {
  log: ENABLE_LOGGING ? (...a) => console.log(...a) : noop,     // eslint-disable-line no-console
  info: ENABLE_LOGGING ? (...a) => console.info(...a) : noop,   // eslint-disable-line no-console
  debug: ENABLE_LOGGING ? (...a) => console.debug(...a) : noop, // eslint-disable-line no-console
  warn: (...a) => console.warn(...a),   // eslint-disable-line no-console
  error: (...a) => console.error(...a), // eslint-disable-line no-console
}

export const criticalLogger = {
  error: (...a) => console.error('[CRITICAL]', ...a), // eslint-disable-line no-console
} 