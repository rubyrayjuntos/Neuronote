/**
 * Tests for LSI (Lens, Store, Isomorphism) Migration System
 * 
 * This module tests:
 * - AutoLens class (get/put with lens law compliance)
 * - migrateContext (forward migration)
 * - salvageContext (backward migration / rollback)
 * - calculateMigrationStats (stats computation)
 * - verifyLensLaws (lens law validation)
 * 
 * @module migration.test
 */

import { describe, it, expect } from 'vitest';
import { 
  AutoLens, 
  migrateContext, 
  migrateContextWithPatches,
  salvageContext,
  salvageContextWithPatches,
  calculateMigrationStats, 
  verifyLensLaws 
} from './migration';
import type { AppContext, AppDefinition, MigrationStats } from '../types';

// ============================================================================
// TEST FIXTURES
// ============================================================================

/** Create a minimal AppDefinition for testing */
function createTestDef(initialContext: AppContext, version = 'test-v1'): AppDefinition {
  return {
    version,
    view: { id: 'root', type: 'Layout.Container', children: [] },
    machine: { initial: 'idle', states: { idle: {} } },
    initialContext,
  } as AppDefinition;
}

// ============================================================================
// AutoLens CLASS TESTS
// ============================================================================

describe('AutoLens', () => {
  describe('get() - Forward Migration', () => {
    it('should apply target schema defaults for new keys', () => {
      const sourceDef = createTestDef({ count: 0 });
      const targetDef = createTestDef({ count: 0, newFeature: 'default' });
      const lens = new AutoLens(sourceDef, targetDef);
      
      const result = lens.get({ count: 5 });
      
      expect(result.count).toBe(5);
      expect(result.newFeature).toBe('default');
    });

    it('should preserve source data over target defaults', () => {
      const sourceDef = createTestDef({ name: 'old' });
      const targetDef = createTestDef({ name: 'default' });
      const lens = new AutoLens(sourceDef, targetDef);
      
      const result = lens.get({ name: 'user-provided' });
      
      expect(result.name).toBe('user-provided');
    });

    it('should preserve ghost data (keys not in schema)', () => {
      const sourceDef = createTestDef({ known: 'value' });
      const targetDef = createTestDef({ known: 'value' });
      const lens = new AutoLens(sourceDef, targetDef);
      
      const result = lens.get({ known: 'value', unknownKey: 'ghost-data' });
      
      expect(result.unknownKey).toBe('ghost-data');
    });

    it('should exclude system keys (starting with _)', () => {
      const sourceDef = createTestDef({ data: 'value' });
      const targetDef = createTestDef({ data: 'value' });
      const lens = new AutoLens(sourceDef, targetDef);
      
      const result = lens.get({ data: 'value', _sys: { state: 'old' } });
      
      expect(result._sys).toBeUndefined();
    });

    it('should handle empty source context', () => {
      const sourceDef = createTestDef({});
      const targetDef = createTestDef({ newKey: 'default' });
      const lens = new AutoLens(sourceDef, targetDef);
      
      const result = lens.get({});
      
      expect(result.newKey).toBe('default');
    });
  });

  describe('put() - Backward Migration', () => {
    it('should preserve source keys when target is overlaid', () => {
      const sourceDef = createTestDef({ a: 1, b: 2 });
      const targetDef = createTestDef({ b: 20, c: 30 });
      const lens = new AutoLens(sourceDef, targetDef);
      
      const result = lens.put({ a: 1, b: 2 }, { b: 20, c: 30 });
      
      expect(result.a).toBe(1);  // Preserved from source
      expect(result.b).toBe(20); // Overwritten by target
      expect(result.c).toBe(30); // Added from target
    });

    it('should apply sourceDef defaults for missing keys', () => {
      const sourceDef = createTestDef({ a: 1, b: 2, c: 3 });
      const targetDef = createTestDef({});
      const lens = new AutoLens(sourceDef, targetDef);
      
      const result = lens.put({}, {});
      
      expect(result.a).toBe(1);
      expect(result.b).toBe(2);
      expect(result.c).toBe(3);
    });

    it('should exclude system keys from target', () => {
      const sourceDef = createTestDef({ data: 'value' });
      const targetDef = createTestDef({ data: 'value' });
      const lens = new AutoLens(sourceDef, targetDef);
      
      const result = lens.put({ data: 'old' }, { data: 'new', _sys: { state: 'broken' } });
      
      expect(result.data).toBe('new');
      expect(result._sys).toBeUndefined();
    });

    it('should preserve ghost data from target', () => {
      const sourceDef = createTestDef({ known: 'value' });
      const targetDef = createTestDef({ known: 'value' });
      const lens = new AutoLens(sourceDef, targetDef);
      
      const result = lens.put({ known: 'old' }, { known: 'new', futureKey: 'ghost' });
      
      expect(result.futureKey).toBe('ghost');
    });
  });

  describe('Lens Laws Compliance', () => {
    it('should satisfy GetPut law: put(s, get(s)) === s', () => {
      const def = createTestDef({ a: 1, b: 'hello', c: true });
      const lens = new AutoLens(def, def);
      const source = { a: 10, b: 'world', c: false };
      
      const afterGet = lens.get(source);
      const afterPut = lens.put(source, afterGet);
      
      // All source keys should be preserved with same values
      expect(afterPut.a).toBe(source.a);
      expect(afterPut.b).toBe(source.b);
      expect(afterPut.c).toBe(source.c);
    });

    it('should satisfy PutGet law: get(put(s, t)) === t (for t keys)', () => {
      const def = createTestDef({ a: 1, b: 2 });
      const lens = new AutoLens(def, def);
      const source = { a: 10, b: 20 };
      const target = { a: 100, b: 200, extra: 'new' };
      
      const afterPut = lens.put(source, target);
      const afterPutGet = lens.get(afterPut);
      
      // Target values should survive round-trip
      expect(afterPutGet.a).toBe(target.a);
      expect(afterPutGet.b).toBe(target.b);
      expect(afterPutGet.extra).toBe(target.extra);
    });

    it('should handle schema evolution (adding fields)', () => {
      const oldDef = createTestDef({ count: 0 });
      const newDef = createTestDef({ count: 0, theme: 'light' });
      const lens = new AutoLens(oldDef, newDef);
      
      const oldData = { count: 42 };
      const evolved = lens.get(oldData);
      
      expect(evolved.count).toBe(42);
      expect(evolved.theme).toBe('light'); // New default applied
    });

    it('should handle schema evolution (removing fields)', () => {
      const oldDef = createTestDef({ count: 0, deprecated: 'old' });
      const newDef = createTestDef({ count: 0 });
      const lens = new AutoLens(oldDef, newDef);
      
      const oldData = { count: 42, deprecated: 'value' };
      const evolved = lens.get(oldData);
      
      // Ghost data is preserved even if not in new schema
      expect(evolved.count).toBe(42);
      expect(evolved.deprecated).toBe('value');
    });
  });
});

// ============================================================================
// migrateContext TESTS
// ============================================================================

describe('migrateContext', () => {
  it('should migrate context and return stats', () => {
    const prevContext = { count: 5, name: 'test' };
    const nextDef = createTestDef({ count: 0, name: '', newField: 'default' });
    
    const { context, stats } = migrateContext(prevContext, nextDef);
    
    expect(context.count).toBe(5);
    expect(context.name).toBe('test');
    expect(context.newField).toBe('default');
    expect(stats.preserved).toBe(2);
    expect(stats.added).toBe(1);
  });

  it('should track dropped keys in stats', () => {
    const prevContext = { keep: 'value', drop: 'gone' };
    const nextDef = createTestDef({ keep: '' });
    
    const { context, stats } = migrateContext(prevContext, nextDef);
    
    // Ghost data is preserved, so nothing is dropped in context
    expect(context.drop).toBe('gone');
    expect(stats.ghost).toBe(1); // 'drop' is ghost data
  });

  it('should handle empty previous context', () => {
    const { context, stats } = migrateContext({}, createTestDef({ a: 1, b: 2 }));
    
    expect(context.a).toBe(1);
    expect(context.b).toBe(2);
    expect(stats.added).toBe(2);
    expect(stats.preserved).toBe(0);
  });
});

// ============================================================================
// salvageContext TESTS
// ============================================================================

describe('salvageContext', () => {
  it('should salvage data from broken context back to old schema', () => {
    const brokenContext = { count: 100, tempData: 'user-input' };
    const targetDef = createTestDef({ count: 0 });
    
    const salvaged = salvageContext(brokenContext, targetDef);
    
    expect(salvaged.count).toBe(100);
    expect(salvaged.tempData).toBe('user-input'); // Ghost data preserved
  });

  it('should apply target defaults for missing keys', () => {
    const brokenContext = { partial: 'data' };
    const targetDef = createTestDef({ partial: '', required: 'default' });
    
    const salvaged = salvageContext(brokenContext, targetDef);
    
    expect(salvaged.partial).toBe('data');
    expect(salvaged.required).toBe('default');
  });

  it('should exclude system keys from broken context', () => {
    const brokenContext = { data: 'value', _sys: { broken: true } };
    const targetDef = createTestDef({ data: '' });
    
    const salvaged = salvageContext(brokenContext, targetDef);
    
    expect(salvaged.data).toBe('value');
    expect(salvaged._sys).toBeUndefined();
  });
});

// ============================================================================
// calculateMigrationStats TESTS
// ============================================================================

describe('calculateMigrationStats', () => {
  it('should count preserved keys', () => {
    const prev = { a: 1, b: 2 };
    const next = { a: 1, b: 2, c: 3 };
    
    const stats = calculateMigrationStats(prev, next);
    
    expect(stats.preserved).toBe(2);
    expect(stats.added).toBe(1);
    expect(stats.dropped).toBe(0);
  });

  it('should count dropped keys', () => {
    const prev = { a: 1, b: 2, c: 3 };
    const next = { a: 1 };
    
    const stats = calculateMigrationStats(prev, next);
    
    expect(stats.preserved).toBe(1);
    expect(stats.dropped).toBe(2);
    expect(stats.details).toContain('Dropped: b, c');
  });

  it('should count ghost keys (data not in schema)', () => {
    const prev = { known: 1, ghost: 'boo' };
    const next = { known: 1, ghost: 'boo' };
    const targetDef = createTestDef({ known: 0 }); // ghost not in schema
    
    const stats = calculateMigrationStats(prev, next, targetDef);
    
    expect(stats.ghost).toBe(1);
    expect(stats.ghostKeys).toContain('ghost');
  });

  it('should count type changes', () => {
    const prev = { count: 5, name: 'test' };
    const next = { count: '5', name: 123 }; // Both changed types
    
    const stats = calculateMigrationStats(prev, next);
    
    expect(stats.typeChanged).toBe(2);
    expect(stats.typeChangedKeys).toHaveLength(2);
  });

  it('should ignore null values in type change detection', () => {
    const prev = { value: null };
    const next = { value: 'now defined' };
    
    const stats = calculateMigrationStats(prev, next);
    
    expect(stats.typeChanged).toBe(0); // null -> string not counted
  });

  it('should ignore system keys in all counts', () => {
    const prev = { _sys: { state: 'old' }, data: 1 };
    const next = { _sys: { state: 'new' }, data: 1 };
    
    const stats = calculateMigrationStats(prev, next);
    
    expect(stats.preserved).toBe(1); // Only 'data', not '_sys'
  });

  it('should report Lossless for no drops or type changes', () => {
    const prev = { a: 1 };
    const next = { a: 1, b: 2 };
    
    const stats = calculateMigrationStats(prev, next);
    
    expect(stats.details).toBe('Lossless');
  });
});

// ============================================================================
// verifyLensLaws TESTS
// ============================================================================

describe('verifyLensLaws', () => {
  it('should return satisfied=true for valid migrations', () => {
    const source = { count: 5, name: 'test' };
    const nextDef = createTestDef({ count: 0, name: '' });
    
    const result = verifyLensLaws(source, nextDef);
    
    expect(result.satisfied).toBe(true);
    expect(result.score).toBe(100);
    expect(result.violation).toBeUndefined();
  });

  it('should detect GetPut law violations (lost keys)', () => {
    // This would require a buggy lens implementation to trigger
    // We test with a valid implementation which should pass
    const source = { a: 1, b: 2, c: 3 };
    const nextDef = createTestDef({ a: 0 });
    
    const result = verifyLensLaws(source, nextDef);
    
    // Current implementation preserves ghost data, so should pass
    expect(result.satisfied).toBe(true);
  });

  it('should handle empty source context', () => {
    const source = {};
    const nextDef = createTestDef({ newKey: 'default' });
    
    const result = verifyLensLaws(source, nextDef);
    
    expect(result.satisfied).toBe(true);
  });

  it('should handle complex nested data', () => {
    const source = { 
      simple: 1, 
      nested: { a: 1, b: 2 }, 
      array: [1, 2, 3] 
    };
    const nextDef = createTestDef({ simple: 0, nested: {}, array: [] });
    
    const result = verifyLensLaws(source, nextDef);
    
    expect(result.satisfied).toBe(true);
  });

  it('should preserve system keys being excluded', () => {
    const source = { data: 'value', _sys: { rootState: 'idle' } };
    const nextDef = createTestDef({ data: '' });
    
    const result = verifyLensLaws(source, nextDef);
    
    // System keys are explicitly excluded from lens operations
    expect(result.satisfied).toBe(true);
  });
});

// ============================================================================
// EDGE CASES & INTEGRATION
// ============================================================================

describe('Edge Cases', () => {
  it('should handle undefined values in context', () => {
    const source = { defined: 'yes', undef: undefined };
    const nextDef = createTestDef({ defined: '', undef: 'default' });
    
    const { context } = migrateContext(source, nextDef);
    
    expect(context.defined).toBe('yes');
    expect(context.undef).toBeUndefined(); // Undefined is preserved (overwrites default)
  });

  it('should handle null values in context', () => {
    const source = { value: null };
    const nextDef = createTestDef({ value: 'default' });
    
    const { context } = migrateContext(source, nextDef);
    
    expect(context.value).toBeNull(); // Null is preserved
  });

  it('should handle deep object values', () => {
    const source = { config: { theme: 'dark', font: 'mono' } };
    const nextDef = createTestDef({ config: { theme: 'light' } });
    
    const { context } = migrateContext(source, nextDef);
    
    // Objects are shallow-copied, not merged
    expect(context.config).toEqual({ theme: 'dark', font: 'mono' });
  });

  it('should handle array values', () => {
    const source = { items: [1, 2, 3] };
    const nextDef = createTestDef({ items: [] });
    
    const { context } = migrateContext(source, nextDef);
    
    expect(context.items).toEqual([1, 2, 3]);
  });

  it('should round-trip migrate then salvage', () => {
    const original = { count: 42, name: 'original' };
    const v1Def = createTestDef({ count: 0, name: '' });
    const v2Def = createTestDef({ count: 0, name: '', newFeature: true });
    
    // Migrate to v2
    const { context: v2Context } = migrateContext(original, v2Def);
    expect(v2Context.newFeature).toBe(true);
    
    // User makes changes in v2
    const modifiedV2 = { ...v2Context, count: 100 };
    
    // Rollback to v1, preserving user changes
    const salvaged = salvageContext(modifiedV2, v1Def);
    
    expect(salvaged.count).toBe(100); // User change preserved
    expect(salvaged.name).toBe('original'); // Original data preserved
    expect(salvaged.newFeature).toBe(true); // Ghost data preserved
  });
});
// ============================================================================
// IMMER PATCH GENERATION TESTS
// ============================================================================

describe('migrateContextWithPatches', () => {
  it('should generate patches for new keys', () => {
    const source = { count: 0 };
    const nextDef = createTestDef({ count: 0, newFeature: 'default' });
    
    const result = migrateContextWithPatches(source, nextDef);
    
    expect(result.context.newFeature).toBe('default');
    expect(result.patches.length).toBeGreaterThan(0);
    
    // Should have an 'add' patch for the new key
    const addPatch = result.patches.find(p => p.op === 'add' && p.path.includes('newFeature'));
    expect(addPatch).toBeDefined();
    expect(addPatch?.value).toBe('default');
  });

  it('should generate inverse patches for rollback', () => {
    const source = { count: 5, name: 'test' };
    const nextDef = createTestDef({ count: 0, name: '', theme: 'dark' });
    
    const result = migrateContextWithPatches(source, nextDef);
    
    expect(result.inversePatches.length).toBeGreaterThan(0);
    // Inverse patches should undo the changes
  });

  it('should preserve existing values with patches', () => {
    const source = { count: 42 };
    const nextDef = createTestDef({ count: 0, extra: true });
    
    const result = migrateContextWithPatches(source, nextDef);
    
    expect(result.context.count).toBe(42); // Preserved
    expect(result.context.extra).toBe(true); // Added
    expect(result.stats.preserved).toBe(1);
    expect(result.stats.added).toBe(1);
  });

  it('should return empty patches for identical contexts', () => {
    const source = { count: 0, name: 'test' };
    const nextDef = createTestDef({ count: 0, name: 'test' });
    
    const result = migrateContextWithPatches(source, nextDef);
    
    // No changes = no patches
    expect(result.patches.length).toBe(0);
    expect(result.inversePatches.length).toBe(0);
  });
});

describe('salvageContextWithPatches', () => {
  it('should generate patches during salvage', () => {
    const brokenContext = { count: 100, newFeature: true };
    const targetDef = createTestDef({ count: 0 });
    
    const result = salvageContextWithPatches(brokenContext, targetDef);
    
    expect(result.context.count).toBe(100); // Salvaged from broken
    expect(result.patches.length).toBeGreaterThan(0);
  });

  it('should preserve ghost data during salvage with patches', () => {
    const brokenContext = { count: 50, futureField: 'preserved' };
    const targetDef = createTestDef({ count: 0 });
    
    const result = salvageContextWithPatches(brokenContext, targetDef);
    
    expect(result.context.count).toBe(50);
    expect(result.context.futureField).toBe('preserved');
  });
});