/**
 * OPERATORS MODULE - Public API
 * 
 * This module exports the operator registry and helper functions.
 * All consumers should import from here, not directly from registry.ts
 */

export * from './types.ts';
export { OPERATOR_REGISTRY } from './registry.ts';

import { OperatorDefinition } from './types.ts';
import { OPERATOR_REGISTRY } from './registry.ts';
import { OperatorType, OperatorSchema, DataType } from '../types.ts';

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get list of all allowed operator names.
 * Used by validator for allowlist checking.
 */
export function getAllowedOperators(registry: Record<string, OperatorDefinition>): string[] {
  return Object.keys(registry);
}

/**
 * Get operator definition by name.
 */
export function getOperator(registry: Record<string, OperatorDefinition>, op: string): OperatorDefinition | undefined {
  return registry[op];
}

/**
 * Check if an operator exists.
 */
export function isValidOperator(registry: Record<string, OperatorDefinition>, op: string): boolean {
  return op in registry;
}

/**
 * Get all operators in a category.
 */
export function getOperatorsByCategory(registry: Record<string, OperatorDefinition>, category: OperatorDefinition['category']): OperatorDefinition[] {
  return Object.values(registry).filter(def => def.category === category);
}

/**
 * Get all Tier 1 (sync, pure) operators.
 */
export function getTier1Operators(registry: Record<string, OperatorDefinition>): OperatorDefinition[] {
  return Object.values(registry).filter(def => def.tier === 1);
}

/**
 * Get all Tier 2 (async, metered) operators.
 */
export function getTier2Operators(registry: Record<string, OperatorDefinition>): OperatorDefinition[] {
  return Object.values(registry).filter(def => def.tier === 2);
}

// ============================================================================
// AI PROMPT GENERATION
// ============================================================================

/**
 * Generate operator documentation for AI system prompt.
 * This is auto-generated from the registry - no manual sync needed.
 * @param registry - Optional, defaults to OPERATOR_REGISTRY
 */
export function generateOperatorDocs(registry: Record<string, OperatorDefinition> = OPERATOR_REGISTRY): string {
  const categories = ['Text', 'Math', 'Image', 'Audio', 'List', 'Logic', 'Utility', 'Sanitizer'] as const;
  
  const sections = categories.map(category => {
    const ops = getOperatorsByCategory(registry, category);
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
export function generateOperatorList(registry: Record<string, OperatorDefinition>): string {
  return Object.keys(registry).map(op => `'${op}'`).join(', ');
}

// ============================================================================
// SCHEMA HELPERS (for validator compatibility)
// ============================================================================

/**
 * Convert registry to legacy schema format.
 * Used by validator.ts and constants.ts for backward compatibility.
 * @alias getOperatorRegistry (for constants.ts compatibility)
 */
export function getLegacyRegistry(registry: Record<string, OperatorDefinition>): Record<string, OperatorSchema> {
  const legacy: Record<string, OperatorSchema> = {};
  
  for (const [op, def] of Object.entries(registry)) {
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

// ============================================================================
// IMPLEMENTATION HELPERS (for Worker)
// ============================================================================

/**
 * Get the implementation function for an operator.
 * Returns undefined if operator doesn't exist.
 */
export function getOperatorImpl(registry: Record<string, OperatorDefinition>, op: string): ((inputs: unknown[]) => unknown | Promise<unknown>) | undefined {
  return registry[op]?.impl;
}

/**
 * Check if an operator is async.
 */
export function isAsyncOp(registry: Record<string, OperatorDefinition>, op: string): boolean {
  return registry[op]?.async ?? false;
}

/**
 * Get all sync operator implementations (for Worker).
 */
export function getSyncOperatorImpls(registry: Record<string, OperatorDefinition>): Record<string, (inputs: unknown[]) => unknown> {
  const impls: Record<string, (inputs: unknown[]) => unknown> = {};
  
  for (const [op, def] of Object.entries(registry)) {
    if (!def.async) {
      impls[op] = def.impl as (inputs: unknown[]) => unknown;
    }
  }
  
  return impls;
}

// ============================================================================
// WORKER CODE GENERATION
// ============================================================================

/**
 * Generate JavaScript source code for all Tier 1 (sync) operators.
 * This is injected into the Worker blob at boot time.
 * 
 * @param registry - The operator registry
 * @returns JavaScript source code defining TIER1_OPERATORS object
 */
export function generateTier1OperatorsSource(registry: Record<string, OperatorDefinition> = OPERATOR_REGISTRY): string {
  const tier1Ops = Object.entries(registry)
    .filter(([_, def]) => def.tier === 1 && !def.async)
    .map(([op, def]) => {
      // Convert the implementation function to source code string
      const implSource = def.impl.toString();
      return `  '${op}': ${implSource}`;
    });
  
  return `const TIER1_OPERATORS = {\n${tier1Ops.join(',\n')}\n};`;
}

/**
 * Get the list of Tier 2 (async) operator names.
 * Tier 2 operators have special implementations in the Worker (OffscreenCanvas, etc.)
 */
export function getTier2OperatorNames(registry: Record<string, OperatorDefinition> = OPERATOR_REGISTRY): string[] {
  return Object.entries(registry)
    .filter(([_, def]) => def.tier === 2 || def.async)
    .map(([op, _]) => op);
}
