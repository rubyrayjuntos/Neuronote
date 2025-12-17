/**
 * OPERATORS MODULE - Public API
 * 
 * This module exports the operator registry and helper functions.
 * All consumers should import from here, not directly from registry.ts
 */

export * from './types';
export { OPERATOR_REGISTRY } from './registry';

import { OPERATOR_REGISTRY } from './registry';
import { OperatorDefinition } from './types';
import { OperatorType, OperatorSchema, DataType } from '../types';

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get list of all allowed operator names.
 * Used by validator for allowlist checking.
 */
export function getAllowedOperators(): string[] {
  return Object.keys(OPERATOR_REGISTRY);
}

/**
 * Get operator definition by name.
 */
export function getOperator(op: string): OperatorDefinition | undefined {
  return OPERATOR_REGISTRY[op];
}

/**
 * Check if an operator exists.
 */
export function isValidOperator(op: string): boolean {
  return op in OPERATOR_REGISTRY;
}

/**
 * Get all operators in a category.
 */
export function getOperatorsByCategory(category: OperatorDefinition['category']): OperatorDefinition[] {
  return Object.values(OPERATOR_REGISTRY).filter(def => def.category === category);
}

/**
 * Get all Tier 1 (sync, pure) operators.
 */
export function getTier1Operators(): OperatorDefinition[] {
  return Object.values(OPERATOR_REGISTRY).filter(def => def.tier === 1);
}

/**
 * Get all Tier 2 (async, metered) operators.
 */
export function getTier2Operators(): OperatorDefinition[] {
  return Object.values(OPERATOR_REGISTRY).filter(def => def.tier === 2);
}

// ============================================================================
// AI PROMPT GENERATION
// ============================================================================

/**
 * Generate operator documentation for AI system prompt.
 * This is auto-generated from the registry - no manual sync needed.
 */
export function generateOperatorDocs(): string {
  const categories = ['Text', 'Math', 'Image', 'Audio', 'List', 'Logic', 'Utility'] as const;
  
  const sections = categories.map(category => {
    const ops = getOperatorsByCategory(category);
    if (ops.length === 0) return '';
    
    const tierNote = ops.some(o => o.tier === 2) ? ' (Tier 2 - Async/Metered)' : '';
    
    const opDocs = ops.map(op => {
      const inputSig = op.inputs.map(i => `${i.name}: ${i.type}`).join(', ');
      const example = op.example ? ` Example: ${op.example}` : '';
      return `   - '${op.op}': (${inputSig}) → ${op.output} - ${op.description}${example}`;
    }).join('\n');
    
    return `${category} Ops${tierNote}:\n${opDocs}`;
  }).filter(s => s.length > 0);
  
  return sections.join('\n\n');
}

/**
 * Generate a compact operator list for AI.
 */
export function generateOperatorList(): string {
  return Object.keys(OPERATOR_REGISTRY).map(op => `'${op}'`).join(', ');
}

// ============================================================================
// SCHEMA HELPERS (for validator compatibility)
// ============================================================================

/**
 * Convert registry to legacy schema format.
 * Used by validator.ts and constants.ts for backward compatibility.
 * @alias getOperatorRegistry (for constants.ts compatibility)
 */
export function getLegacyRegistry(): Record<string, OperatorSchema> {
  const legacy: Record<string, OperatorSchema> = {};
  
  for (const [op, def] of Object.entries(OPERATOR_REGISTRY)) {
    legacy[op] = {
      op: def.op as OperatorType,
      inputs: def.inputs.map(i => ({ name: i.name, type: i.type as DataType })),
      output: def.output as DataType,
      description: def.description,
      pure: def.pure,
    };
  }
  
  return legacy;
}

// Alias for constants.ts compatibility
export const getOperatorRegistry = getLegacyRegistry;

// ============================================================================
// IMPLEMENTATION HELPERS (for Worker)
// ============================================================================

/**
 * Get the implementation function for an operator.
 * Returns undefined if operator doesn't exist.
 */
export function getOperatorImpl(op: string): ((inputs: unknown[]) => unknown | Promise<unknown>) | undefined {
  return OPERATOR_REGISTRY[op]?.impl;
}

/**
 * Check if an operator is async.
 */
export function isAsyncOp(op: string): boolean {
  return OPERATOR_REGISTRY[op]?.async ?? false;
}

/**
 * Get all sync operator implementations (for Worker).
 */
export function getSyncOperatorImpls(): Record<string, (inputs: unknown[]) => unknown> {
  const impls: Record<string, (inputs: unknown[]) => unknown> = {};
  
  for (const [op, def] of Object.entries(OPERATOR_REGISTRY)) {
    if (!def.async) {
      impls[op] = def.impl as (inputs: unknown[]) => unknown;
    }
  }
  
  return impls;
}
