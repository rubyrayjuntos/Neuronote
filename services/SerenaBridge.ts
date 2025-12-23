/**
 * SERENA BRIDGE - Two-Phase Retrieval Service
 * 
 * Implements the "Diner Menu" pattern for AI proposal generation:
 * 
 * PHASE 1 (Menu Scan):
 *   AI receives abbreviated operator list (~500 tokens)
 *   AI selects relevant operators based on user intent
 * 
 * PHASE 2 (Full Specs):
 *   AI requests detailed specs for selected operators only
 *   AI generates proposal with precise knowledge
 * 
 * This architecture:
 * - Reduces token usage by ~90%
 * - Prevents operator hallucination (can't invent what's not on menu)
 * - Separates concerns: AI does intent→selection, Serena does knowledge
 * 
 * FUTURE: Will integrate with Serena MCP server for LSP-backed code analysis
 */

import { 
  generateMenuString, 
  getFullSpecsString, 
  MenuEntry, 
  FullOperatorSpec,
  generateMenu,
  getFullSpecs,
  searchOperators,
} from '../operators/menu';
import { OPERATOR_REGISTRY } from '../operators/registry';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Bridge configuration options.
 */
export interface SerenaBridgeConfig {
  /** Maximum operators to return in Phase 1 menu (0 = all) */
  menuLimit?: number;
  /** Include tier information in menu */
  includeTiers?: boolean;
  /** Include examples in full specs */
  includeExamples?: boolean;
}

/**
 * Phase 1 response: Abbreviated menu.
 */
export interface MenuResponse {
  menu: MenuEntry[];
  formatted: string;
  totalCount: number;
  categories: string[];
}

/**
 * Phase 2 response: Full specifications.
 */
export interface SpecsResponse {
  specs: FullOperatorSpec[];
  formatted: string;
  requestedCount: number;
  foundCount: number;
  notFound: string[];
}

/**
 * Combined response for single-shot retrieval.
 */
export interface CombinedResponse {
  menu: MenuResponse;
  specs?: SpecsResponse;
}

// ============================================================================
// SERENA BRIDGE CLASS
// ============================================================================

/**
 * SerenaBridge provides two-phase retrieval for AI proposal generation.
 * 
 * Usage:
 * ```typescript
 * const bridge = new SerenaBridge();
 * 
 * // Phase 1: Get menu
 * const menu = bridge.getMenu();
 * // Send menu.formatted to AI with user intent
 * 
 * // Phase 2: AI selects operators, get full specs
 * const specs = bridge.getFullSpecs(['Image.Blur', 'Math.Add']);
 * // Send specs.formatted to AI for proposal generation
 * ```
 */
export class SerenaBridge {
  private config: SerenaBridgeConfig;

  constructor(config: SerenaBridgeConfig = {}) {
    this.config = {
      menuLimit: 0,
      includeTiers: true,
      includeExamples: true,
      ...config,
    };
  }

  // ==========================================================================
  // PHASE 1: MENU RETRIEVAL
  // ==========================================================================

  /**
   * Get abbreviated operator menu.
   * This is the "diner menu" - one-line descriptions for AI scanning.
   * Respects menuLimit and includeTiers config options.
   */
  getMenu(): MenuResponse {
    let menu = generateMenu(OPERATOR_REGISTRY);
    
    // Apply menu limit if configured
    if (this.config.menuLimit && this.config.menuLimit > 0) {
      menu = menu.slice(0, this.config.menuLimit);
    }
    
    const categories = [...new Set(menu.map(m => m.category))];
    
    // Format with or without tier information
    const formatted = this.formatMenuEntries(menu);
    
    return {
      menu,
      formatted,
      totalCount: menu.length,
      categories,
    };
  }

  /**
   * Format menu entries, optionally including tier information.
   */
  private formatMenuEntries(entries: MenuEntry[]): string {
    const byCategory = new Map<string, MenuEntry[]>();
    
    for (const entry of entries) {
      const existing = byCategory.get(entry.category) || [];
      existing.push(entry);
      byCategory.set(entry.category, existing);
    }
    
    const sections: string[] = [];
    for (const [category, categoryEntries] of byCategory) {
      const lines = categoryEntries.map(m => {
        if (this.config.includeTiers && m.tier) {
          return `  • ${m.op} [${m.tier}] - ${m.summary}`;
        }
        return `  • ${m.op} - ${m.summary}`;
      });
      sections.push(`${category}:\n${lines.join('\n')}`);
    }
    
    return sections.join('\n\n');
  }

  /**
   * Get menu filtered by category.
   */
  getMenuByCategory(category: string): MenuResponse {
    let allMenu = generateMenu(OPERATOR_REGISTRY);
    let filtered = allMenu.filter(m => m.category === category);
    
    // Apply menu limit if configured
    if (this.config.menuLimit && this.config.menuLimit > 0) {
      filtered = filtered.slice(0, this.config.menuLimit);
    }
    
    const formatted = this.formatMenuEntries(filtered);
    
    return {
      menu: filtered,
      formatted: `${category}:\n${formatted}`,
      totalCount: filtered.length,
      categories: [category],
    };
  }

  /**
   * Search menu by keyword.
   */
  searchMenu(keyword: string): MenuResponse {
    let results = searchOperators(keyword, OPERATOR_REGISTRY);
    
    // Apply menu limit if configured
    if (this.config.menuLimit && this.config.menuLimit > 0) {
      results = results.slice(0, this.config.menuLimit);
    }
    
    const categories = [...new Set(results.map(m => m.category))];
    
    const formatted = results.map(m => {
      if (this.config.includeTiers && m.tier) {
        return `  • ${m.op} [${m.tier}] - ${m.summary}`;
      }
      return `  • ${m.op} - ${m.summary}`;
    }).join('\n');
    
    return {
      menu: results,
      formatted: `Search results for "${keyword}":\n${formatted}`,
      totalCount: results.length,
      categories,
    };
  }

  // ==========================================================================
  // PHASE 2: FULL SPEC RETRIEVAL
  // ==========================================================================

  /**
   * Get full specifications for selected operators.
   * This is the detailed knowledge for proposal generation.
   * Respects includeExamples config option.
   */
  getFullSpecs(operatorIds: string[]): SpecsResponse {
    const specs = getFullSpecs(operatorIds, OPERATOR_REGISTRY);
    const foundIds = specs.map(s => s.op);
    const notFound = operatorIds.filter(id => !foundIds.includes(id));
    
    // Format with or without examples based on config
    const formatted = this.formatSpecEntries(specs);
    
    return {
      specs,
      formatted,
      requestedCount: operatorIds.length,
      foundCount: specs.length,
      notFound,
    };
  }

  /**
   * Format spec entries, optionally excluding examples.
   */
  private formatSpecEntries(specs: FullOperatorSpec[]): string {
    return specs.map(spec => {
      const lines = [
        `## ${spec.op}`,
        `Category: ${spec.category}`,
        `${spec.description}`,
        '',
        'Inputs:',
        ...Object.entries(spec.inputs).map(([name, type]) => `  - ${name}: ${type}`),
        '',
        `Output: ${spec.outputType}`,
      ];
      
      // Only include examples if config allows
      if (this.config.includeExamples && spec.example) {
        lines.push('', 'Example:');
        lines.push(`  ${spec.example}`);
      }
      
      return lines.join('\n');
    }).join('\n\n---\n\n');
  }

  // ==========================================================================
  // COMBINED RETRIEVAL (for simpler workflows)
  // ==========================================================================

  /**
   * Get menu and optionally specs in one call.
   * Useful when AI selection is done externally.
   */
  getCombined(selectedOperators?: string[]): CombinedResponse {
    const menu = this.getMenu();
    
    if (selectedOperators && selectedOperators.length > 0) {
      return {
        menu,
        specs: this.getFullSpecs(selectedOperators),
      };
    }
    
    return { menu };
  }

  // ==========================================================================
  // PROMPT BUILDERS (for AI integration)
  // ==========================================================================

  /**
   * Build Phase 1 prompt segment.
   * Include this in the AI system prompt for initial scan.
   */
  buildMenuPrompt(): string {
    const menu = this.getMenu();
    return `<<<OPERATOR_MENU>>>
The following operators are available. Review this menu and select the operators needed for the user's request.

${menu.formatted}

Total: ${menu.totalCount} operators in ${menu.categories.length} categories
<<<END_OPERATOR_MENU>>>`;
  }

  /**
   * Build Phase 2 prompt segment.
   * Include this after AI has selected operators.
   */
  buildSpecsPrompt(operatorIds: string[]): string {
    const specs = this.getFullSpecs(operatorIds);
    
    let prompt = `<<<SELECTED_OPERATORS>>>
Full specifications for your selected operators:

${specs.formatted}`;

    if (specs.notFound.length > 0) {
      prompt += `\n\nWARNING: These operators were not found: ${specs.notFound.join(', ')}
Please choose from the menu only.`;
    }

    prompt += '\n<<<END_SELECTED_OPERATORS>>>';
    
    return prompt;
  }

  /**
   * Build combined prompt for single-shot generation.
   * Used when AI selection phase is skipped.
   */
  buildFullPrompt(relevantCategories?: string[]): string {
    if (relevantCategories && relevantCategories.length > 0) {
      // Filter to relevant categories only
      const allMenu = generateMenu(OPERATOR_REGISTRY);
      const filtered = allMenu.filter(m => 
        relevantCategories.includes(m.category)
      );
      const operatorIds = filtered.map(m => m.op);
      return this.buildSpecsPrompt(operatorIds);
    }
    
    // Return full specs for all operators (legacy behavior)
    const allIds = Object.keys(OPERATOR_REGISTRY);
    return this.buildSpecsPrompt(allIds);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Default bridge instance for convenience.
 */
export const serenaBridge = new SerenaBridge();

// ============================================================================
// FUTURE: MCP CLIENT INTEGRATION
// ============================================================================

/**
 * PLANNED: MCPClient for Serena server communication.
 * Will enable:
 * - Code analysis operators (Code.Analyze, Code.FindReferences)
 * - LSP-backed type information
 * - JetBrains plugin integration
 * 
 * Implementation pending WebSocket transport setup.
 */
// export class MCPClient {
//   private ws: WebSocket | null = null;
//   
//   async connect(url: string): Promise<void> { ... }
//   async callTool(name: string, args: unknown): Promise<unknown> { ... }
//   async getSymbols(file: string): Promise<Symbol[]> { ... }
// }
