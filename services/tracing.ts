/**
 * TRACE ID & TAINT LEVEL SYSTEM
 * 
 * Provides end-to-end traceability for the dual-kernel architecture.
 * Addresses three integration concerns:
 * 
 * 1. Trace ID Propagation: UUID v7 generated at request entry, passed through all phases
 * 2. Taint Levels: Explicit labeling of data contamination levels
 * 3. Audit Linking: Connects gateway rejections to kernel rejections
 * 
 * TAINT LEVELS (matching process.md specification):
 * - Level 0: Clean (constants, hardcoded values)
 * - Level 1: Public (system-generated IDs, timestamps)
 * - Level 2: Tainted (user-generated content, requires sanitization)
 * - Level 3: Sensitive (auth tokens, PII - never passed to LLM)
 */

// ============================================================================
// TAINT LEVEL SYSTEM
// ============================================================================

export type TaintLevel = 0 | 1 | 2 | 3;

export const TAINT_LABELS = {
  0: 'CLEAN',      // Constants, hardcoded values
  1: 'PUBLIC',     // System-generated, safe to display
  2: 'TAINTED',    // User-generated, requires sanitization before use
  3: 'SENSITIVE',  // Auth tokens, PII - NEVER pass to LLM
} as const;

/**
 * Wrapper for data with explicit taint level.
 * This teaches the AI (and any gateway) how to handle the data.
 */
export interface TaintedData<T = unknown> {
  data: T;
  taint: TaintLevel;
  label: typeof TAINT_LABELS[TaintLevel];
  source: string;  // Origin of this data (e.g., "context.tasks", "user.input")
}

/**
 * Wrap data with explicit taint level.
 */
export function taint<T>(data: T, level: TaintLevel, source: string): TaintedData<T> {
  return {
    data,
    taint: level,
    label: TAINT_LABELS[level],
    source,
  };
}

/**
 * Create a Level 0 (Clean) data wrapper.
 * Use for constants and hardcoded values.
 */
export function clean<T>(data: T, source: string): TaintedData<T> {
  return taint(data, 0, source);
}

/**
 * Create a Level 1 (Public) data wrapper.
 * Use for system-generated IDs, timestamps, computed values.
 */
export function public_<T>(data: T, source: string): TaintedData<T> {
  return taint(data, 1, source);
}

/**
 * Create a Level 2 (Tainted) data wrapper.
 * Use for user-generated content that needs sanitization.
 */
export function tainted<T>(data: T, source: string): TaintedData<T> {
  return taint(data, 2, source);
}

/**
 * Create a Level 3 (Sensitive) data wrapper.
 * Use for auth tokens, PII - these are NEVER passed to LLM.
 */
export function sensitive<T>(data: T, source: string): TaintedData<T> {
  return taint(data, 3, source);
}

/**
 * Check if data is safe to pass to LLM (Level 0-2 only).
 */
export function isLLMSafe(data: TaintedData): boolean {
  return data.taint < 3;
}

/**
 * Filter a collection of tainted data to only LLM-safe items.
 */
export function filterForLLM<T>(items: TaintedData<T>[]): TaintedData<T>[] {
  return items.filter(isLLMSafe);
}

// ============================================================================
// UUID V7 GENERATION (Timestamp-based for ordering)
// ============================================================================

/**
 * Generate a UUID v7 (timestamp-based, sortable).
 * This provides:
 * - Chronological ordering (first 48 bits are timestamp)
 * - Uniqueness (remaining bits are random)
 * - Traceability across gateway and kernel
 */
export function generateTraceId(): string {
  const timestamp = Date.now();
  
  // UUID v7 structure:
  // - 48 bits: unix timestamp in ms
  // - 4 bits: version (7)
  // - 12 bits: random
  // - 2 bits: variant (10)
  // - 62 bits: random
  
  const timestampHex = timestamp.toString(16).padStart(12, '0');
  
  // Generate random parts
  const randomBytes = new Uint8Array(10);
  crypto.getRandomValues(randomBytes);
  
  // Build UUID v7
  const uuid = [
    timestampHex.slice(0, 8),                           // time_low (8 hex = 32 bits)
    timestampHex.slice(8, 12),                          // time_mid (4 hex = 16 bits)
    '7' + randomToHex(randomBytes.slice(0, 2)).slice(1, 4), // version 7 + 12 random bits (4 hex)
    ((randomBytes[2] & 0x3f) | 0x80).toString(16).padStart(2, '0') + randomToHex(randomBytes.slice(3, 4)), // variant (2 bits) + 14 random bits
    randomToHex(randomBytes.slice(4, 10)),              // 48 random bits (12 hex)
  ].join('-');
  
  return uuid;
}

function randomToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Extract timestamp from UUID v7 for audit ordering.
 */
export function extractTimestampFromTraceId(traceId: string): number {
  const hex = traceId.replace(/-/g, '').slice(0, 12);
  return parseInt(hex, 16);
}

// ============================================================================
// REQUEST TRACE CONTEXT
// ============================================================================

/**
 * Complete trace context for a request.
 * This is the "handshake" object passed from gateway to kernel.
 */
export interface RequestTrace {
  traceId: string;           // UUID v7 generated at request entry
  sessionId?: string;        // Optional session identifier
  timestamp: number;         // Request start time
  phase: TracePhase;         // Current processing phase
  gatewayVersion?: string;   // Version of the gateway (for compatibility checks)
  kernelVersion?: string;    // Version of the validation kernel
  
  // Audit trail
  auditLog: AuditEntry[];
}

export type TracePhase = 
  | 'GATEWAY_RECEIVED'      // Phase 0: Python gateway received intent
  | 'GATEWAY_VALIDATED'     // Phase 0.5: Python gateway validated intent
  | 'GATEWAY_REJECTED'      // Phase 0.5: Python gateway rejected (security canary)
  | 'KERNEL_RECEIVED'       // Phase 1: TypeScript kernel received blueprint
  | 'KERNEL_STRUCTURAL'     // Phase 2: Structural validation
  | 'KERNEL_SEMANTIC'       // Phase 2.5: Semantic validation
  | 'KERNEL_HONESTY'        // Phase 2.7: Honesty oracle check
  | 'KERNEL_APPROVED'       // Phase 3: Kernel approved blueprint
  | 'KERNEL_REJECTED'       // Phase 3: Kernel rejected blueprint
  | 'RUNTIME_ASSEMBLED'     // Phase 4: React components assembled
  | 'RUNTIME_ERROR';        // Phase 4: Runtime error during assembly

export interface AuditEntry {
  timestamp: number;
  phase: TracePhase;
  action: string;
  details?: Record<string, unknown>;
  taintLevels?: Record<string, TaintLevel>;  // What taint levels were involved
}

/**
 * Create a new request trace at the gateway entry point.
 */
export function createRequestTrace(sessionId?: string): RequestTrace {
  const traceId = generateTraceId();
  const timestamp = Date.now();
  
  return {
    traceId,
    sessionId,
    timestamp,
    phase: 'GATEWAY_RECEIVED',
    auditLog: [{
      timestamp,
      phase: 'GATEWAY_RECEIVED',
      action: 'Request received',
    }],
  };
}

/**
 * Add an entry to the audit log.
 */
export function recordAuditEntry(
  trace: RequestTrace,
  phase: TracePhase,
  action: string,
  details?: Record<string, unknown>,
  taintLevels?: Record<string, TaintLevel>
): RequestTrace {
  return {
    ...trace,
    phase,
    auditLog: [
      ...trace.auditLog,
      {
        timestamp: Date.now(),
        phase,
        action,
        details,
        taintLevels,
      },
    ],
  };
}

// ============================================================================
// PRUNED CONTEXT FOR LLM (with explicit taint labels)
// ============================================================================

/**
 * Pruned context to send to LLM.
 * All data is explicitly labeled with taint levels.
 */
export interface PrunedContext {
  traceId: string;  // Links this context to the full audit trail
  
  // Labeled data (matching Python gateway's prune_application_context)
  visibleNodes: TaintedData<string[]>;    // Level 1: system-generated IDs
  activeToolIds: TaintedData<string[]>;   // Level 1: system-generated IDs
  currentState: TaintedData<string>;      // Level 0: state machine state name
  contextKeys: TaintedData<string[]>;     // Level 1: context key names
  
  // Explicitly excluded (Level 3 - Sensitive)
  // - auth_tokens: NEVER included
  // - hidden_metadata: NEVER included
}

/**
 * Create a pruned context for LLM consumption.
 * This is the TypeScript equivalent of Python's prune_application_context.
 */
export function createPrunedContext(
  traceId: string,
  visibleNodes: string[],
  activeToolIds: string[],
  currentState: string,
  contextKeys: string[]
): PrunedContext {
  return {
    traceId,
    visibleNodes: public_(visibleNodes, 'view.nodes'),
    activeToolIds: public_(activeToolIds, 'definition.pipelines'),
    currentState: clean(currentState, 'machine.current'),
    contextKeys: public_(contextKeys, 'context.keys'),
  };
}

// ============================================================================
// EXPORT FOR PYTHON GATEWAY (JSON-serializable)
// ============================================================================

/**
 * Export trace and taint types as JSON schema for Python consumption.
 * This is the "shared source of truth" between Python and TypeScript.
 */
export const TRACE_SCHEMA = {
  version: '1.0.0',
  taintLevels: {
    0: { name: 'CLEAN', description: 'Constants, hardcoded values', llmSafe: true },
    1: { name: 'PUBLIC', description: 'System-generated IDs, timestamps', llmSafe: true },
    2: { name: 'TAINTED', description: 'User-generated content', llmSafe: true, requiresSanitization: true },
    3: { name: 'SENSITIVE', description: 'Auth tokens, PII', llmSafe: false },
  },
  phases: [
    'GATEWAY_RECEIVED',
    'GATEWAY_VALIDATED',
    'GATEWAY_REJECTED',
    'KERNEL_RECEIVED',
    'KERNEL_STRUCTURAL',
    'KERNEL_SEMANTIC',
    'KERNEL_HONESTY',
    'KERNEL_APPROVED',
    'KERNEL_REJECTED',
    'RUNTIME_ASSEMBLED',
    'RUNTIME_ERROR',
  ],
};
