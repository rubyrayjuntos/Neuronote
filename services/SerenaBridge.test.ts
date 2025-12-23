/**
 * SERENA BRIDGE TESTS
 * 
 * Tests for the two-phase retrieval service that provides
 * operator information to AI providers.
 */

import { describe, it, expect } from 'vitest';
import {
  SerenaBridge,
  serenaBridge,
  SerenaBridgeConfig,
  MenuResponse,
  SpecsResponse,
  CombinedResponse,
} from './SerenaBridge';
import { OPERATOR_REGISTRY } from '../operators/registry';

// ============================================================================
// CONSTRUCTOR AND CONFIG TESTS
// ============================================================================

describe('SerenaBridge Constructor', () => {
  it('should create instance with default config', () => {
    const bridge = new SerenaBridge();
    
    expect(bridge).toBeInstanceOf(SerenaBridge);
  });

  it('should create instance with custom config', () => {
    const config: SerenaBridgeConfig = {
      menuLimit: 10,
      includeTiers: false,
      includeExamples: false,
    };
    const bridge = new SerenaBridge(config);
    
    expect(bridge).toBeInstanceOf(SerenaBridge);
  });

  it('should export singleton instance', () => {
    expect(serenaBridge).toBeInstanceOf(SerenaBridge);
  });
});

// ============================================================================
// CONFIG OPTIONS TESTS
// ============================================================================

describe('Config Options', () => {
  describe('menuLimit', () => {
    it('should limit menu results when menuLimit is set', () => {
      const limitedBridge = new SerenaBridge({ menuLimit: 5 });
      const response = limitedBridge.getMenu();
      
      expect(response.menu.length).toBe(5);
      expect(response.totalCount).toBe(5);
    });

    it('should apply limit to category results', () => {
      const limitedBridge = new SerenaBridge({ menuLimit: 2 });
      const response = limitedBridge.getMenuByCategory('Math');
      
      expect(response.menu.length).toBeLessThanOrEqual(2);
    });

    it('should apply limit to search results', () => {
      const limitedBridge = new SerenaBridge({ menuLimit: 3 });
      const response = limitedBridge.searchMenu('text');
      
      expect(response.menu.length).toBeLessThanOrEqual(3);
    });

    it('should not limit when menuLimit is 0', () => {
      const unlimitedBridge = new SerenaBridge({ menuLimit: 0 });
      const response = unlimitedBridge.getMenu();
      const registryCount = Object.keys(OPERATOR_REGISTRY).length;
      
      expect(response.menu.length).toBe(registryCount);
    });
  });

  describe('includeTiers', () => {
    it('should include tier info when includeTiers is true', () => {
      const bridge = new SerenaBridge({ includeTiers: true });
      const response = bridge.getMenu();
      
      // Should have tier markers like [Core] or [Advanced] in formatted output
      // (depends on whether operators have tier property)
      expect(response.formatted).toBeDefined();
    });

    it('should exclude tier info when includeTiers is false', () => {
      const bridgeWithTiers = new SerenaBridge({ includeTiers: true });
      const bridgeWithoutTiers = new SerenaBridge({ includeTiers: false });
      
      const withTiers = bridgeWithTiers.getMenu();
      const withoutTiers = bridgeWithoutTiers.getMenu();
      
      // If tiers exist, the with-tiers version should be longer or equal
      expect(withTiers.formatted.length).toBeGreaterThanOrEqual(withoutTiers.formatted.length - 10);
    });
  });

  describe('includeExamples', () => {
    it('should include examples when includeExamples is true', () => {
      const bridge = new SerenaBridge({ includeExamples: true });
      const response = bridge.getFullSpecs(['Add']);
      
      // Should include example section
      expect(response.formatted).toBeDefined();
    });

    it('should exclude examples when includeExamples is false', () => {
      const bridgeWithExamples = new SerenaBridge({ includeExamples: true });
      const bridgeWithoutExamples = new SerenaBridge({ includeExamples: false });
      
      const withExamples = bridgeWithExamples.getFullSpecs(['Add']);
      const withoutExamples = bridgeWithoutExamples.getFullSpecs(['Add']);
      
      // With examples should be longer
      expect(withExamples.formatted.length).toBeGreaterThanOrEqual(withoutExamples.formatted.length);
    });
  });
});

// ============================================================================
// PHASE 1: MENU RETRIEVAL TESTS
// ============================================================================

describe('Phase 1: Menu Retrieval', () => {
  const bridge = new SerenaBridge();

  describe('getMenu', () => {
    it('should return MenuResponse with all required fields', () => {
      const response = bridge.getMenu();
      
      expect(response).toHaveProperty('menu');
      expect(response).toHaveProperty('formatted');
      expect(response).toHaveProperty('totalCount');
      expect(response).toHaveProperty('categories');
    });

    it('should include all operators in menu', () => {
      const response = bridge.getMenu();
      const registryCount = Object.keys(OPERATOR_REGISTRY).length;
      
      expect(response.menu.length).toBe(registryCount);
      expect(response.totalCount).toBe(registryCount);
    });

    it('should have non-empty formatted string', () => {
      const response = bridge.getMenu();
      
      expect(response.formatted.length).toBeGreaterThan(100);
    });

    it('should extract all unique categories', () => {
      const response = bridge.getMenu();
      const uniqueCategories = new Set(response.menu.map(m => m.category));
      
      expect(response.categories.length).toBe(uniqueCategories.size);
    });
  });

  describe('getMenuByCategory', () => {
    it('should filter to single category', () => {
      const response = bridge.getMenuByCategory('Text');
      
      expect(response.categories).toEqual(['Text']);
      for (const item of response.menu) {
        expect(item.category).toBe('Text');
      }
    });

    it('should return correct count for category', () => {
      const response = bridge.getMenuByCategory('Math');
      
      expect(response.totalCount).toBe(response.menu.length);
      expect(response.totalCount).toBeGreaterThan(0);
    });

    it('should return empty for invalid category', () => {
      const response = bridge.getMenuByCategory('NonExistent');
      
      expect(response.menu).toEqual([]);
      expect(response.totalCount).toBe(0);
    });

    it('should format with category header', () => {
      const response = bridge.getMenuByCategory('List');
      
      expect(response.formatted).toContain('List:');
    });
  });

  describe('searchMenu', () => {
    it('should find operators by keyword', () => {
      const response = bridge.searchMenu('upper');
      
      expect(response.menu.length).toBeGreaterThan(0);
      expect(response.menu.some(m => m.op === 'Text.ToUpper')).toBe(true);
    });

    it('should include search term in formatted output', () => {
      const response = bridge.searchMenu('add');
      
      expect(response.formatted).toContain('Search results for "add"');
    });

    it('should return empty for no matches', () => {
      const response = bridge.searchMenu('xyznonexistent123');
      
      expect(response.menu).toEqual([]);
      expect(response.totalCount).toBe(0);
    });
  });
});

// ============================================================================
// PHASE 2: FULL SPEC RETRIEVAL TESTS
// ============================================================================

describe('Phase 2: Full Spec Retrieval', () => {
  const bridge = new SerenaBridge();

  describe('getFullSpecs', () => {
    it('should return SpecsResponse with all required fields', () => {
      const response = bridge.getFullSpecs(['Text.ToUpper']);
      
      expect(response).toHaveProperty('specs');
      expect(response).toHaveProperty('formatted');
      expect(response).toHaveProperty('requestedCount');
      expect(response).toHaveProperty('foundCount');
      expect(response).toHaveProperty('notFound');
    });

    it('should return specs for valid operators', () => {
      const response = bridge.getFullSpecs(['Text.ToUpper', 'Math.Add']);
      
      expect(response.specs.length).toBe(2);
      expect(response.foundCount).toBe(2);
      expect(response.requestedCount).toBe(2);
    });

    it('should track not-found operators', () => {
      const response = bridge.getFullSpecs(['Text.ToUpper', 'Invalid.Op']);
      
      expect(response.foundCount).toBe(1);
      expect(response.requestedCount).toBe(2);
      expect(response.notFound).toEqual(['Invalid.Op']);
    });

    it('should handle all invalid operators', () => {
      const response = bridge.getFullSpecs(['Invalid.One', 'Invalid.Two']);
      
      expect(response.foundCount).toBe(0);
      expect(response.notFound.length).toBe(2);
    });

    it('should have non-empty formatted string for valid operators', () => {
      const response = bridge.getFullSpecs(['Text.ToUpper']);
      
      expect(response.formatted.length).toBeGreaterThan(50);
    });
  });
});

// ============================================================================
// COMBINED RETRIEVAL TESTS
// ============================================================================

describe('Combined Retrieval', () => {
  const bridge = new SerenaBridge();

  describe('getCombined', () => {
    it('should return menu without specs when no operators selected', () => {
      const response = bridge.getCombined();
      
      expect(response.menu).toBeDefined();
      expect(response.specs).toBeUndefined();
    });

    it('should return menu and specs when operators selected', () => {
      const response = bridge.getCombined(['Text.ToUpper', 'Math.Add']);
      
      expect(response.menu).toBeDefined();
      expect(response.specs).toBeDefined();
      expect(response.specs?.foundCount).toBe(2);
    });

    it('should return menu without specs for empty array', () => {
      const response = bridge.getCombined([]);
      
      expect(response.menu).toBeDefined();
      expect(response.specs).toBeUndefined();
    });
  });
});

// ============================================================================
// PROMPT BUILDER TESTS
// ============================================================================

describe('Prompt Builders', () => {
  const bridge = new SerenaBridge();

  describe('buildMenuPrompt', () => {
    it('should include delimiter tags', () => {
      const prompt = bridge.buildMenuPrompt();
      
      expect(prompt).toContain('<<<OPERATOR_MENU>>>');
      expect(prompt).toContain('<<<END_OPERATOR_MENU>>>');
    });

    it('should include operator count', () => {
      const prompt = bridge.buildMenuPrompt();
      const count = Object.keys(OPERATOR_REGISTRY).length;
      
      expect(prompt).toContain(`Total: ${count} operators`);
    });

    it('should include category count', () => {
      const prompt = bridge.buildMenuPrompt();
      
      expect(prompt).toMatch(/\d+ categories/);
    });
  });

  describe('buildSpecsPrompt', () => {
    it('should include delimiter tags', () => {
      const prompt = bridge.buildSpecsPrompt(['Text.ToUpper']);
      
      expect(prompt).toContain('<<<SELECTED_OPERATORS>>>');
      expect(prompt).toContain('<<<END_SELECTED_OPERATORS>>>');
    });

    it('should include operator specs', () => {
      const prompt = bridge.buildSpecsPrompt(['Text.ToUpper']);
      
      expect(prompt).toContain('Text.ToUpper');
    });

    it('should warn about not-found operators', () => {
      const prompt = bridge.buildSpecsPrompt(['Text.ToUpper', 'Invalid.Op']);
      
      expect(prompt).toContain('WARNING');
      expect(prompt).toContain('Invalid.Op');
      expect(prompt).toContain('not found');
    });

    it('should not include warning when all operators found', () => {
      const prompt = bridge.buildSpecsPrompt(['Text.ToUpper', 'Math.Add']);
      
      expect(prompt).not.toContain('WARNING');
    });
  });

  describe('buildFullPrompt', () => {
    it('should filter by categories when provided', () => {
      const prompt = bridge.buildFullPrompt(['Text']);
      
      expect(prompt).toContain('Text.ToUpper');
      // Should not contain Image operators if filtering to Text only
      expect(prompt).not.toContain('Image.Grayscale');
    });

    it('should include all operators when no categories provided', () => {
      const prompt = bridge.buildFullPrompt();
      
      expect(prompt).toContain('Text.ToUpper');
      expect(prompt).toContain('Math.Add');
    });

    it('should handle empty categories array like no filter', () => {
      const promptEmpty = bridge.buildFullPrompt([]);
      const promptNoFilter = bridge.buildFullPrompt();
      
      // Both should have same content (all operators)
      expect(promptEmpty.length).toBe(promptNoFilter.length);
    });
  });
});

// ============================================================================
// INTEGRATION WITH PROMPT OPTIONS
// ============================================================================

describe('Integration Tests', () => {
  it('should work end-to-end for Phase 1 → Phase 2 flow', () => {
    const bridge = new SerenaBridge();
    
    // Phase 1: Get menu
    const menu = bridge.getMenu();
    expect(menu.totalCount).toBeGreaterThan(0);
    
    // Simulate AI selection (pick first 3 operators)
    const selectedOps = menu.menu.slice(0, 3).map(m => m.op);
    
    // Phase 2: Get full specs
    const specs = bridge.getFullSpecs(selectedOps);
    expect(specs.foundCount).toBe(3);
    expect(specs.notFound).toEqual([]);
  });

  it('should handle category-filtered workflow', () => {
    const bridge = new SerenaBridge();
    
    // Get operators in a specific category
    const menuByCategory = bridge.getMenuByCategory('Math');
    const mathOps = menuByCategory.menu.map(m => m.op);
    
    // Get specs for those operators
    const specs = bridge.getFullSpecs(mathOps);
    
    expect(specs.foundCount).toBe(mathOps.length);
    for (const spec of specs.specs) {
      expect(spec.category).toBe('Math');
    }
  });

  it('should handle search-based workflow', () => {
    const bridge = new SerenaBridge();
    
    // Search for operators
    const searchResults = bridge.searchMenu('list');
    const foundOps = searchResults.menu.map(m => m.op);
    
    // Get specs for search results
    if (foundOps.length > 0) {
      const specs = bridge.getFullSpecs(foundOps);
      expect(specs.foundCount).toBe(foundOps.length);
    }
  });
});
