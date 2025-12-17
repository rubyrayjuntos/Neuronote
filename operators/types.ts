/**
 * OPERATOR TYPE DEFINITIONS
 * 
 * This module defines the schema for operators in the NeuroNote system.
 * Every operator must conform to this interface to be usable by the Guest.
 */

/**
 * Data types that can flow through pipelines.
 */
export type DataType = 'string' | 'number' | 'boolean' | 'json' | 'image' | 'audio' | 'array' | 'any';

/**
 * Input port definition for an operator.
 */
export interface OperatorInput {
  name: string;
  type: DataType;
  description?: string;
}

/**
 * Testable algebraic properties of an operator.
 * These drive property-based test generation.
 * 
 * From CONTRIBUTING.md:
 * - Idempotency: Does f(f(x)) == f(x)?
 * - Associativity: Is f(a, f(b, c)) === f(f(a, b), c)?
 * - Commutativity: Is f(a, b) === f(b, a)?
 * - Invertibility: Can the operation be undone via a Lens?
 * - Bounded: Guaranteed to terminate?
 */
export interface OperatorProperties {
  /** f(f(x)) === f(x) - Applying twice gives same result as once */
  idempotent?: boolean;
  
  /** f(a, f(b, c)) === f(f(a, b), c) - Grouping doesn't matter */
  associative?: boolean;
  
  /** f(a, b) === f(b, a) - Order doesn't matter */
  commutative?: boolean;
  
  /** Has a lens inverse for undo/rollback */
  invertible?: boolean;
  
  /** Guaranteed to terminate (no unbounded loops) */
  bounded?: boolean;
  
  /** Output depends only on inputs (no hidden state) */
  deterministic?: boolean;
}

/**
 * Operator implementation function signature.
 * All operators take an array of inputs and return a value.
 */
export type OperatorImpl = (inputs: unknown[]) => unknown | Promise<unknown>;

/**
 * Complete operator definition - the single source of truth.
 * 
 * This schema captures everything needed for:
 * - Validation (inputs, output types)
 * - AI documentation (description, examples)
 * - Runtime execution (impl)
 * - Test generation (properties)
 * - Governance (tier, async, pure)
 */
export interface OperatorDefinition {
  // === Identity ===
  /** Fully qualified operator name (e.g., 'Image.Grayscale') */
  op: string;
  
  /** Category for grouping (e.g., 'Image', 'Audio', 'Text') */
  category: 'Text' | 'Math' | 'Image' | 'Audio' | 'List' | 'Logic' | 'Utility';
  
  // === Type Signature ===
  /** Input port definitions */
  inputs: OperatorInput[];
  
  /** Output type */
  output: DataType;
  
  /** Human-readable description for AI and docs */
  description: string;
  
  /** Optional example for AI prompt */
  example?: string;
  
  // === Governance (The Tier Model) ===
  /**
   * Execution tier:
   * - Tier 1: Pure compute (total, deterministic, terminating, sync)
   * - Tier 2: Metered compute (fuel + memory bounded, may be async)
   */
  tier: 1 | 2;
  
  /** Must always be true - operators have no side effects */
  pure: true;
  
  /** Whether implementation returns a Promise */
  async: boolean;
  
  // === Testable Properties ===
  /** Algebraic properties for property-based testing */
  properties: OperatorProperties;
  
  // === Implementation ===
  /** The actual operator function */
  impl: OperatorImpl;
}

/**
 * Type guard to check if an operator is async.
 */
export function isAsyncOperator(def: OperatorDefinition): boolean {
  return def.async;
}

/**
 * Get the operator's tier for governance decisions.
 */
export function getOperatorTier(def: OperatorDefinition): 1 | 2 {
  return def.tier;
}
