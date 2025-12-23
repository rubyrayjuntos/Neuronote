/**
 * MENU MODULE TESTS
 * 
 * Tests for the two-phase "Diner Menu" retrieval pattern:
 * - Phase 1: Abbreviated menu generation
 * - Phase 2: Full spec retrieval for selected operators
 */

import { describe, it, expect } from 'vitest';
import {
  generateMenu,
  generateMenuString,
  generateMenuJSON,
  getFullSpecs,
  getFullSpecsString,
  getFullSpecsJSON,
  getOperatorsByCategory,
  getCategories,
  searchOperators,
  MenuEntry,
  FullOperatorSpec,
} from './menu';
import { OPERATOR_REGISTRY } from './registry';

// ============================================================================
// PHASE 1: MENU GENERATION TESTS
// ============================================================================

describe('Phase 1: Menu Generation', () => {
  describe('generateMenu', () => {
    it('should generate menu entries for all operators', () => {
      const menu = generateMenu();
      const registryCount = Object.keys(OPERATOR_REGISTRY).length;
      
      expect(menu.length).toBe(registryCount);
    });

    it('should include required fields in each entry', () => {
      const menu = generateMenu();
      
      for (const entry of menu) {
        expect(entry).toHaveProperty('op');
        expect(entry).toHaveProperty('summary');
        expect(entry).toHaveProperty('category');
        expect(entry).toHaveProperty('tier');
        expect(typeof entry.op).toBe('string');
        expect(typeof entry.summary).toBe('string');
        expect(typeof entry.category).toBe('string');
        expect([1, 2]).toContain(entry.tier);
      }
    });

    it('should truncate long descriptions to 60 chars', () => {
      const menu = generateMenu();
      
      for (const entry of menu) {
        expect(entry.summary.length).toBeLessThanOrEqual(60);
      }
    });

    it('should preserve operator IDs exactly', () => {
      const menu = generateMenu();
      const menuOps = new Set(menu.map(m => m.op));
      const registryOps = new Set(Object.keys(OPERATOR_REGISTRY));
      
      expect(menuOps).toEqual(registryOps);
    });

    it('should work with custom registry', () => {
      const customRegistry = {
        'Test.Op': {
          op: 'Test.Op',
          description: 'A test operator',
          category: 'Test' as const,
          tier: 1 as const,
          inputs: [],
          output: 'string',
          pure: true,
          async: false,
          properties: { complexity: 1 as const },
        },
      };
      
      const menu = generateMenu(customRegistry as any);
      expect(menu.length).toBe(1);
      expect(menu[0].op).toBe('Test.Op');
    });
  });

  describe('generateMenuString', () => {
    it('should generate non-empty formatted string', () => {
      const menuStr = generateMenuString();
      
      expect(menuStr.length).toBeGreaterThan(100);
    });

    it('should group operators by category', () => {
      const menuStr = generateMenuString();
      
      // Should contain category headers
      expect(menuStr).toContain('Text');
      expect(menuStr).toContain('Math');
      expect(menuStr).toContain('List');
    });

    it('should use bullet points for items', () => {
      const menuStr = generateMenuString();
      
      expect(menuStr).toContain('•');
    });

    it('should mark Tier 2 categories with [T2]', () => {
      const menuStr = generateMenuString();
      
      // Image and Audio are Tier 2 categories
      expect(menuStr).toMatch(/Image.*\[T2\]|Audio.*\[T2\]/);
    });
  });

  describe('generateMenuJSON', () => {
    it('should generate valid JSON', () => {
      const json = generateMenuJSON();
      
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should parse to array of MenuEntry', () => {
      const json = generateMenuJSON();
      const parsed = JSON.parse(json) as MenuEntry[];
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(Object.keys(OPERATOR_REGISTRY).length);
    });
  });
});

// ============================================================================
// PHASE 2: FULL SPEC RETRIEVAL TESTS
// ============================================================================

describe('Phase 2: Full Spec Retrieval', () => {
  describe('getFullSpecs', () => {
    it('should return specs for valid operator IDs', () => {
      const specs = getFullSpecs(['Text.ToUpper', 'Math.Add']);
      
      expect(specs.length).toBe(2);
      expect(specs[0].op).toBe('Text.ToUpper');
      expect(specs[1].op).toBe('Math.Add');
    });

    it('should skip invalid operator IDs', () => {
      const specs = getFullSpecs(['Text.ToUpper', 'Invalid.Op', 'Math.Add']);
      
      expect(specs.length).toBe(2);
      expect(specs.map(s => s.op)).not.toContain('Invalid.Op');
    });

    it('should return empty array for all invalid IDs', () => {
      const specs = getFullSpecs(['Invalid.One', 'Invalid.Two']);
      
      expect(specs).toEqual([]);
    });

    it('should include full operator details', () => {
      const specs = getFullSpecs(['Text.ToUpper']);
      const spec = specs[0];
      
      expect(spec).toHaveProperty('op');
      expect(spec).toHaveProperty('description');
      expect(spec).toHaveProperty('inputs');
      expect(spec).toHaveProperty('output');
      expect(spec).toHaveProperty('pure');
      expect(spec).toHaveProperty('async');
      expect(spec).toHaveProperty('tier');
      expect(spec).toHaveProperty('category');
    });

    it('should include input details with names and types', () => {
      const specs = getFullSpecs(['Math.Add']);
      const spec = specs[0];
      
      expect(spec.inputs.length).toBe(2);
      expect(spec.inputs[0]).toHaveProperty('name');
      expect(spec.inputs[0]).toHaveProperty('type');
    });

    it('should include example if present', () => {
      const specs = getFullSpecs(['Text.ToUpper']);
      const spec = specs[0];
      
      // Text.ToUpper may or may not have an example
      if (OPERATOR_REGISTRY['Text.ToUpper'].example) {
        expect(spec.example).toBeDefined();
      }
    });
  });

  describe('getFullSpecsString', () => {
    it('should generate formatted spec string', () => {
      const specStr = getFullSpecsString(['Text.ToUpper', 'Math.Add']);
      
      expect(specStr).toContain('Text.ToUpper');
      expect(specStr).toContain('Math.Add');
    });

    it('should include flags (pure/sync/tier)', () => {
      const specStr = getFullSpecsString(['Text.ToUpper']);
      
      expect(specStr).toMatch(/pure|impure/);
      expect(specStr).toMatch(/sync|async/);
      expect(specStr).toMatch(/tier-\d/);
    });

    it('should include input signatures', () => {
      const specStr = getFullSpecsString(['Math.Add']);
      
      expect(specStr).toContain('Inputs:');
      expect(specStr).toContain('number');
    });

    it('should return empty string for no valid operators', () => {
      const specStr = getFullSpecsString(['Invalid.Op']);
      
      expect(specStr).toBe('');
    });
  });

  describe('getFullSpecsJSON', () => {
    it('should generate valid JSON', () => {
      const json = getFullSpecsJSON(['Text.ToUpper', 'Math.Add']);
      
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should parse to array of FullOperatorSpec', () => {
      const json = getFullSpecsJSON(['Text.ToUpper']);
      const parsed = JSON.parse(json) as FullOperatorSpec[];
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].op).toBe('Text.ToUpper');
    });
  });
});

// ============================================================================
// UTILITY FUNCTION TESTS
// ============================================================================

describe('Utility Functions', () => {
  describe('getCategories', () => {
    it('should return all unique categories', () => {
      const categories = getCategories();
      
      expect(categories).toContain('Text');
      expect(categories).toContain('Math');
      expect(categories).toContain('List');
      expect(categories).toContain('Image');
      expect(categories).toContain('Audio');
    });

    it('should return unique values only', () => {
      const categories = getCategories();
      const uniqueSet = new Set(categories);
      
      expect(categories.length).toBe(uniqueSet.size);
    });
  });

  describe('getOperatorsByCategory', () => {
    it('should return operator IDs for valid category', () => {
      const textOps = getOperatorsByCategory('Text');
      
      expect(textOps.length).toBeGreaterThan(0);
      for (const op of textOps) {
        expect(OPERATOR_REGISTRY[op].category).toBe('Text');
      }
    });

    it('should return empty array for invalid category', () => {
      const ops = getOperatorsByCategory('NonExistent');
      
      expect(ops).toEqual([]);
    });

    it('should return only IDs (strings)', () => {
      const ops = getOperatorsByCategory('Math');
      
      for (const op of ops) {
        expect(typeof op).toBe('string');
      }
    });
  });

  describe('searchOperators', () => {
    it('should find operators by name keyword', () => {
      const results = searchOperators('upper');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.op === 'Text.ToUpper')).toBe(true);
    });

    it('should find operators by description keyword', () => {
      const results = searchOperators('convert');
      
      expect(results.length).toBeGreaterThan(0);
    });

    it('should be case-insensitive', () => {
      const lowerResults = searchOperators('add');
      const upperResults = searchOperators('ADD');
      
      expect(lowerResults.length).toBe(upperResults.length);
    });

    it('should return empty array for no matches', () => {
      const results = searchOperators('xyznonexistent123');
      
      expect(results).toEqual([]);
    });

    it('should return MenuEntry objects', () => {
      const results = searchOperators('text');
      
      for (const result of results) {
        expect(result).toHaveProperty('op');
        expect(result).toHaveProperty('summary');
        expect(result).toHaveProperty('category');
        expect(result).toHaveProperty('tier');
      }
    });
  });
});

// ============================================================================
// TOKEN EFFICIENCY TESTS
// ============================================================================

describe('Token Efficiency', () => {
  it('menu string should be smaller than full specs', () => {
    const menu = generateMenuString();
    const allOps = Object.keys(OPERATOR_REGISTRY);
    const fullSpecs = getFullSpecsString(allOps);
    
    // Menu should be smaller than full specs (exact ratio depends on operator descriptions)
    expect(menu.length).toBeLessThan(fullSpecs.length);
  });

  it('selective specs should be smaller than full specs', () => {
    const allOps = Object.keys(OPERATOR_REGISTRY);
    const fullSpecs = getFullSpecsString(allOps);
    const selectiveSpecs = getFullSpecsString(['Text.ToUpper', 'Math.Add']);
    
    expect(selectiveSpecs.length).toBeLessThan(fullSpecs.length / 10);
  });
});
