/**
 * OPERATOR TYPE DEFINITIONS
 * 
 * This module defines the schema for operators in the NeuroNote system.
 * Every operator must conform to this interface to be usable by the Guest.
 */

/**
 * Data types that can flow through pipelines.
 */
export type DataType = 'string' | 'number' | 'boolean' | 'json' | 'image' | 'audio' | 'array' | 'svg' | 'any';

/**
 * Taint level for data security tracking.
 * 0: Clean (e.g., server-sent constants, sanitized data)
 * 1: Public (e.g., user input that has been validated for structure but not content)
 * 2: Tainted (e.g., raw, unvalidated user input)
 */
export type TaintLevel = 0 | 1 | 2;

/**
 * Input port definition for an operator.
 */
export interface OperatorInput {
  /** Name of the input parameter */
  name: string;
  /** Data type expected for this input */
  type: DataType;
  /** Optional description for documentation */
  description?: string;
}

/**
 * Measurable properties for validation and test generation.
 */
export interface OperatorProperties {
  /** Big O complexity weight (1=constant, 5=linear, 10=nested) */
  complexity: 1 | 5 | 10;

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

  /** The maximum taint level this operator accepts on its inputs. Defaults to 2 (accepts anything). */
  inputTaint?: TaintLevel;
  
  /** The taint level of the data this operator outputs. Defaults to input taint. */
  outputTaint?: TaintLevel;
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
  category: 'Text' | 'Math' | 'Image' | 'Audio' | 'List' | 'Logic' | 'Utility' | 'Sanitizer' | 'CV' | 'Vector' | 'Debug';
  
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
