/**
 * OPERATOR MENU - Abbreviated Operator List for AI
 * 
 * Implements the "Diner Menu" pattern:
 * - Phase 1: AI receives abbreviated list (one-liner descriptions)
 * - Phase 2: AI requests full specs for selected operators only
 * 
 * This reduces token usage by ~90% while maintaining precision.
 */

import { OperatorDefinition } from './types';
import { OPERATOR_REGISTRY } from './registry';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Abbreviated menu item for Phase 1 retrieval.
 * Contains only what AI needs to make a selection decision.
 */
export interface MenuEntry {
  op: string;
  summary: string;  // One-line description (max 60 chars)
  category: string;
  tier: 1 | 2;
}

/**
 * Full operator spec for Phase 2 retrieval.
 * Complete information for proposal generation.
 */
export interface FullOperatorSpec {
  op: string;
  description: string;
  inputs: Array<{ name: string; type: string; description?: string }>;
  output: string;
  pure: boolean;
  async: boolean;
  tier: 1 | 2;
  category: string;
  example?: string;
  properties?: {
    invertible?: boolean;
  };
}

// ============================================================================
// PHASE 1: MENU GENERATION (Abbreviated)
// ============================================================================

/**
 * Generate abbreviated menu for all operators.
 * Each entry is one line: "op - summary"
 * 
 * @returns Array of MenuEntry objects
 */
export function generateMenu(
  registry: Record<string, OperatorDefinition> = OPERATOR_REGISTRY
): MenuEntry[] {
  return Object.values(registry).map(def => ({
    op: def.op,
    summary: truncate(def.description, 60),
    category: def.category,
    tier: def.tier,
  }));
}

/**
 * Generate menu as formatted string for AI prompt.
 * Grouped by category for easier scanning.
 */
export function generateMenuString(
  registry: Record<string, OperatorDefinition> = OPERATOR_REGISTRY
): string {
  const menu = generateMenu(registry);
  const categories = [...new Set(menu.map(m => m.category))];
  
  const sections = categories.map(category => {
    const items = menu.filter(m => m.category === category);
    const tierNote = items.some(i => i.tier === 2) ? ' [T2]' : '';
    const lines = items.map(i => `  • ${i.op} - ${i.summary}`);
    return `${category}${tierNote}:\n${lines.join('\n')}`;
  });
  
  return sections.join('\n\n');
}

/**
 * Generate menu as JSON for structured retrieval.
 */
export function generateMenuJSON(
  registry: Record<string, OperatorDefinition> = OPERATOR_REGISTRY
): string {
  return JSON.stringify(generateMenu(registry), null, 2);
}

// ============================================================================
// PHASE 2: FULL SPEC RETRIEVAL
// ============================================================================

/**
 * Get full specifications for selected operators.
 * Called after AI makes selection from menu.
 * 
 * @param operatorIds - Array of operator names (e.g., ["Image.Blur", "Math.Add"])
 * @returns Array of full specifications
 */
export function getFullSpecs(
  operatorIds: string[],
  registry: Record<string, OperatorDefinition> = OPERATOR_REGISTRY
): FullOperatorSpec[] {
  return operatorIds
    .filter(id => id in registry)
    .map(id => {
      const def = registry[id];
      return {
        op: def.op,
        description: def.description,
        inputs: def.inputs.map(i => ({
          name: i.name,
          type: i.type,
          description: i.description,
        })),
        output: def.output,
        pure: def.pure,
        async: def.async,
        tier: def.tier,
        category: def.category,
        example: def.example,
        properties: def.properties,
      };
    });
}

/**
 * Get full specifications as formatted string for AI prompt.
 */
export function getFullSpecsString(
  operatorIds: string[],
  registry: Record<string, OperatorDefinition> = OPERATOR_REGISTRY
): string {
  const specs = getFullSpecs(operatorIds, registry);
  
  return specs.map(spec => {
    const inputSig = spec.inputs
      .map(i => `${i.name}: ${i.type}${i.description ? ` (${i.description})` : ''}`)
      .join(', ');
    
    const flags = [
      spec.pure ? 'pure' : 'impure',
      spec.async ? 'async' : 'sync',
      `tier-${spec.tier}`,
    ].join(', ');
    
    const example = spec.example ? `\n    Example: ${spec.example}` : '';
    
    return `${spec.op} [${flags}]
    ${spec.description}
    Inputs: (${inputSig})
    Output: ${spec.output}${example}`;
  }).join('\n\n');
}

/**
 * Get full specifications as JSON for structured retrieval.
 */
export function getFullSpecsJSON(
  operatorIds: string[],
  registry: Record<string, OperatorDefinition> = OPERATOR_REGISTRY
): string {
  return JSON.stringify(getFullSpecs(operatorIds, registry), null, 2);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Truncate string to max length, adding ellipsis if needed.
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Get operator IDs by category.
 */
export function getOperatorsByCategory(
  category: string,
  registry: Record<string, OperatorDefinition> = OPERATOR_REGISTRY
): string[] {
  return Object.values(registry)
    .filter(def => def.category === category)
    .map(def => def.op);
}

/**
 * Get all categories.
 */
export function getCategories(
  registry: Record<string, OperatorDefinition> = OPERATOR_REGISTRY
): string[] {
  return [...new Set(Object.values(registry).map(def => def.category))];
}

/**
 * Search operators by keyword (searches op name and description).
 */
export function searchOperators(
  keyword: string,
  registry: Record<string, OperatorDefinition> = OPERATOR_REGISTRY
): MenuEntry[] {
  const lower = keyword.toLowerCase();
  return generateMenu(registry).filter(
    entry => 
      entry.op.toLowerCase().includes(lower) ||
      entry.summary.toLowerCase().includes(lower)
  );
}
