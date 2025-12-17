import { SystemLog } from '../types';

/**
 * Logging abstraction for NeuroNote.
 * Provides consistent log formatting and can be extended for
 * remote logging, persistence, or debug filtering.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
export type LogSource = SystemLog['source'];  // Derived from SystemLog for consistency

interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SUCCESS: 1, // Same as INFO
};

const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: 'INFO',
  enableConsole: process.env.NODE_ENV !== 'production',
};

let config = { ...DEFAULT_CONFIG };

/**
 * Create a SystemLog entry.
 */
export function createLog(
  source: LogSource,
  type: SystemLog['type'],
  message: string,
  payload?: unknown
): SystemLog {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    source,
    type,
    message,
    payload,
  };
}

/**
 * Log to console if enabled and above minimum level.
 */
function consoleLog(level: LogLevel, source: LogSource, message: string, payload?: unknown): void {
  if (!config.enableConsole) return;
  if (LOG_LEVELS[level] < LOG_LEVELS[config.minLevel]) return;

  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const prefix = `[${timestamp}] [${source}]`;

  switch (level) {
    case 'ERROR':
      console.error(prefix, message, payload ?? '');
      break;
    case 'WARN':
      console.warn(prefix, message, payload ?? '');
      break;
    case 'SUCCESS':
      console.log(`%c${prefix} ✓ ${message}`, 'color: #22c55e', payload ?? '');
      break;
    case 'DEBUG':
      console.debug(prefix, message, payload ?? '');
      break;
    default:
      console.log(prefix, message, payload ?? '');
  }
}

/**
 * Logger factory - creates a logger bound to a specific source.
 */
export function createLogger(source: LogSource) {
  return {
    debug: (message: string, payload?: unknown) => {
      consoleLog('DEBUG', source, message, payload);
      return createLog(source, 'INFO', message, payload);
    },
    info: (message: string, payload?: unknown) => {
      consoleLog('INFO', source, message, payload);
      return createLog(source, 'INFO', message, payload);
    },
    warn: (message: string, payload?: unknown) => {
      consoleLog('WARN', source, message, payload);
      return createLog(source, 'WARN', message, payload);
    },
    error: (message: string, payload?: unknown) => {
      consoleLog('ERROR', source, message, payload);
      return createLog(source, 'ERROR', message, payload);
    },
    success: (message: string, payload?: unknown) => {
      consoleLog('SUCCESS', source, message, payload);
      return createLog(source, 'SUCCESS', message, payload);
    },
  };
}

/**
 * Configure the logger.
 */
export function configureLogger(newConfig: Partial<LoggerConfig>): void {
  config = { ...config, ...newConfig };
}

// Pre-configured loggers for common sources
export const hostLogger = createLogger('HOST');
export const guestLogger = createLogger('GUEST');
export const validatorLogger = createLogger('VALIDATOR');
export const storageLogger = createLogger('STORAGE');
export const kernelLogger = createLogger('KERNEL');
