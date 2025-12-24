import { AppContext, AppDefinition, MigrationStats } from '../types';

/**
 * A Bidirectional Lens for Malleable State.
 * S = Source (Old State)
 * T = Target (New State)
 */
export interface Lens<S, T> {
  get: (source: S) => T;         // Forward Migration (Evolution)
  put: (source: S, target: T) => S; // Backward Migration (Salvage/Rollback)
}

interface AutoLensResult {
  result: AppContext;
  stats: MigrationStats;
}

/**
 * The "AutoLens" infers a structural mapping between two Schemas.
 * It enforces the "GetPut" and "PutGet" laws as best as possible for dynamic schemas.
 * 
 * UPDATE v2.1: Now supports "Structural Polymorphism" (Ghost Data Preservation).
 * It preserves keys that are not defined in the schema to ensure forward compatibility
 * with future fields or concurrent peer edits.
 */
export class AutoLens implements Lens<AppContext, AppContext> {
  private sourceDef: AppDefinition;
  private targetDef: AppDefinition;

  constructor(sourceDef: AppDefinition, targetDef: AppDefinition) {
    this.sourceDef = sourceDef;
    this.targetDef = targetDef;
  }

  /**
   * Forward: Project Old Context into New Schema
   * Preserves matching keys, applies New defaults for missing keys, AND carries over "Ghost Data".
   */
  get(source: AppContext): AppContext {
    // 1. Start with New Schema defaults (Initializes new features)
    const targetCtx = { ...this.targetDef.initialContext };

    // 2. Overlay ALL Source Data (Preserves User Data + Ghost Data)
    Object.keys(source).forEach(key => {
      // We strictly exclude system keys ('_') from blind copying to allow state reset
      if (!key.startsWith('_')) {
        targetCtx[key] = source[key];
      }
    });

    return targetCtx;
  }

  /**
   * Backward: Salvage data from a New Context back into Old Schema.
   * Used during Rollbacks to preserve edits made in the "bad" version.
   * 
   * Satisfies PutGet Law: get(put(s, t)) === t (for keys in t)
   * Satisfies GetPut Law: put(s, get(s)) === s (preserves source keys)
   */
  put(source: AppContext, target: AppContext): AppContext {
    // 1. Start from source (preserves keys not touched by target) - Required for GetPut law
    const restored = { ...source };
    
    // 2. Overlay ALL Target Data (Preserves "Future" Data / Ghost Data)
    Object.keys(target).forEach(key => {
      if (!key.startsWith('_')) {
        restored[key] = target[key];
      }
    });

    // 3. Apply defaults only for keys missing from both source and target
    Object.keys(this.sourceDef.initialContext).forEach(key => {
      if (!(key in restored) && !key.startsWith('_')) {
        restored[key] = this.sourceDef.initialContext[key];
      }
    });

    return restored;
  }
}

/**
 * Helper to compute stats for the migration report
 */
export function calculateMigrationStats(prev: AppContext, next: AppContext, targetDef?: AppDefinition): MigrationStats {
  const prevKeys = new Set(Object.keys(prev));
  const nextKeys = new Set(Object.keys(next));
  const schemaKeys = targetDef ? new Set(Object.keys(targetDef.initialContext)) : new Set();
  
  let preserved = 0;
  let added = 0;
  let dropped = 0;
  let ghost = 0;
  let typeChanged = 0;
  const droppedKeys: string[] = [];
  const ghostKeys: string[] = [];
  const typeChangedKeys: string[] = [];

  nextKeys.forEach(k => {
    if (k.startsWith('_')) return; // Ignore system keys in stats
    
    if (prevKeys.has(k)) {
        preserved++;
        // Check if this is a "Ghost Key" (Present in data, but NOT in the new schema)
        if (targetDef && !schemaKeys.has(k)) {
            ghost++;
            ghostKeys.push(k);
        }
        // Check for type changes (potential coercion issues)
        const prevType = typeof prev[k];
        const nextType = typeof next[k];
        if (prevType !== nextType && prev[k] !== null && next[k] !== null) {
            typeChanged++;
            typeChangedKeys.push(`${k}: ${prevType} → ${nextType}`);
        }
    } else {
        added++;
    }
  });

  prevKeys.forEach(k => {
    if (k.startsWith('_')) return; // Ignore system keys in stats
    if (!nextKeys.has(k)) {
      dropped++;
      droppedKeys.push(k);
    }
  });

  return {
    preserved,
    added,
    dropped,
    ghost,
    typeChanged,
    ghostKeys,
    typeChangedKeys,
    details: droppedKeys.length > 0 
      ? `Dropped: ${droppedKeys.join(', ')}` 
      : typeChangedKeys.length > 0 
        ? `Type changes: ${typeChangedKeys.join(', ')}` 
        : 'Lossless'
  };
}

// Legacy wrapper for compatibility, now powered by Lens
export function migrateContext(prevContext: AppContext, nextDef: AppDefinition): { context: AppContext, stats: MigrationStats } {
  // Mock source def isn't strictly needed for 'get' in this polymorphic version 
  // as we just overlay prevContext, but we keep the architecture consistent.
  const mockSourceDef: AppDefinition = { ...nextDef, initialContext: prevContext }; 
  
  const lens = new AutoLens(mockSourceDef, nextDef);
  const nextContext = lens.get(prevContext);
  
  return {
    context: nextContext,
    stats: calculateMigrationStats(prevContext, nextContext, nextDef)
  };
}

// New: Explicit Recovery function using Lens.put
export function salvageContext(brokenContext: AppContext, targetDef: AppDefinition): AppContext {
  // We treat 'brokenContext' as the Target (the state we are retreating FROM)
  // We treat 'targetDef' as the Source (the state we are retreating TO)
  
  const mockBrokenDef: AppDefinition = { ...targetDef, initialContext: brokenContext };
  const lens = new AutoLens(targetDef, mockBrokenDef);
  
  return lens.put(targetDef.initialContext, brokenContext);
}

/**
 * Validates the Lens Laws for the given migration.
 * Used for System Integrity checks.
 * 
 * Tests both fundamental lens laws:
 * - GetPut: put(s, get(s)) === s  (round-trip preserves source)
 * - PutGet: get(put(s, t)) === t  (put then get returns target, for overlapping keys)
 */
export function verifyLensLaws(source: AppContext, nextDef: AppDefinition): { satisfied: boolean, score: number, violation?: string } {
    try {
        const lens = new AutoLens({ ...nextDef, initialContext: source }, nextDef);
        
        // === LAW 1: GetPut - put(s, get(s)) === s ===
        // "If you get a value and put it back, nothing changes"
        const evolved = lens.get(source);
        const salvaged = lens.put(source, evolved);
        
        // Check if we lost any keys from the source (Allowing for additions)
        const sourceKeys = Object.keys(source).filter(k => !k.startsWith('_'));
        const lostKeys = sourceKeys.filter(k => !salvaged.hasOwnProperty(k));
        
        if (lostKeys.length > 0) {
            return { satisfied: false, score: 0, violation: `GetPut Law Broken: Round-trip lost keys [${lostKeys.join(', ')}]` };
        }
        
        // Check values are preserved (not just keys)
        const changedValues = sourceKeys.filter(k => {
            const srcVal = JSON.stringify(source[k]);
            const resVal = JSON.stringify(salvaged[k]);
            return srcVal !== resVal;
        });
        
        if (changedValues.length > 0) {
            return { satisfied: false, score: 50, violation: `GetPut Law Partial: Values changed for keys [${changedValues.join(', ')}]` };
        }
        
        // === LAW 2: PutGet - get(put(s, t)) === t ===
        // "If you put a value and get it back, you get what you put"
        // Test with a synthetic target that differs from source
        const syntheticTarget: AppContext = { 
            ...nextDef.initialContext
        };
        // Add a non-system test key (must NOT start with _ to pass through lens)
        const testKey = 'putget_test_marker';
        syntheticTarget[testKey] = 'test_value_12345';
        
        const afterPut = lens.put(source, syntheticTarget);
        const afterPutGet = lens.get(afterPut);
        
        // The test key should survive the round-trip
        if (afterPutGet[testKey] !== syntheticTarget[testKey]) {
            return { satisfied: false, score: 50, violation: `PutGet Law Broken: put->get did not preserve target value` };
        }
        
        return { satisfied: true, score: 100 };
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        return { satisfied: false, score: 0, violation: message };
    }
}