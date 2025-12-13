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
   * Preserves matching keys, applies New defaults for missing keys.
   */
  get(source: AppContext): AppContext {
    const targetCtx = { ...this.targetDef.initialContext };
    const sourceKeys = new Set(Object.keys(source));
    const targetKeys = new Set(Object.keys(targetCtx));

    targetKeys.forEach(key => {
      // 1. Exact Match: Preserve User Data
      if (sourceKeys.has(key) && !key.startsWith('_')) {
        targetCtx[key] = source[key];
      }
      // 2. Renaming/Heuristics could go here (e.g. "todoList" -> "todos")
      // For MVP, we stick to strict key equality implies identity.
    });

    return targetCtx;
  }

  /**
   * Backward: Salvage data from a New Context back into Old Schema.
   * Used during Rollbacks to preserve edits made in the "bad" version.
   */
  put(source: AppContext, target: AppContext): AppContext {
    // Start with the original source (to keep its structure/defaults)
    const restored = { ...this.sourceDef.initialContext };
    
    // We want to apply any "compatible" changes from Target back to Source.
    const sourceKeys = new Set(Object.keys(restored));
    
    Object.keys(target).forEach(key => {
      // If the key exists in the Old Schema, update it with the value from the New Context (The "Edit")
      if (sourceKeys.has(key) && !key.startsWith('_')) {
        restored[key] = target[key];
      }
    });

    // We do NOT add new keys from Target, because Source schema doesn't know them.
    // This satisfies the Lens law that put(s, t) must be a valid s.
    return restored;
  }
}

/**
 * Helper to compute stats for the migration report
 */
export function calculateMigrationStats(prev: AppContext, next: AppContext): MigrationStats {
  const prevKeys = new Set(Object.keys(prev));
  const nextKeys = new Set(Object.keys(next));
  
  let preserved = 0;
  let added = 0;
  let dropped = 0;
  const droppedKeys: string[] = [];

  nextKeys.forEach(k => {
    if (prevKeys.has(k)) preserved++;
    else added++;
  });

  prevKeys.forEach(k => {
    if (!nextKeys.has(k)) {
      dropped++;
      if (!k.startsWith('_')) droppedKeys.push(k);
    }
  });

  return {
    preserved,
    added,
    dropped,
    details: droppedKeys.length > 0 ? `Dropped: ${droppedKeys.join(', ')}` : 'Lossless'
  };
}

// Legacy wrapper for compatibility, now powered by Lens
export function migrateContext(prevContext: AppContext, nextDef: AppDefinition): { context: AppContext, stats: MigrationStats } {
  // We don't have the full "Previous Definition" here easily in the current signature, 
  // but we can assume the 'prevContext' represents the source data.
  // We mock the sourceDef for the Lens since we only strictly need the keys from prevContext for 'get'.
  const mockSourceDef: AppDefinition = { ...nextDef, initialContext: prevContext }; // Hack for source structure
  
  const lens = new AutoLens(mockSourceDef, nextDef);
  const nextContext = lens.get(prevContext);
  
  return {
    context: nextContext,
    stats: calculateMigrationStats(prevContext, nextContext)
  };
}

// New: Explicit Recovery function using Lens.put
export function salvageContext(brokenContext: AppContext, targetDef: AppDefinition): AppContext {
  // We treat 'brokenContext' as the Target (the state we are retreating FROM)
  // We treat 'targetDef' as the Source (the state we are retreating TO)
  // So we construct a Lens(Source=TargetDef, Target=BrokenDef)
  // And we call lens.put(targetDef.initialContext, brokenContext)
  
  const mockBrokenDef: AppDefinition = { ...targetDef, initialContext: brokenContext };
  const lens = new AutoLens(targetDef, mockBrokenDef);
  
  // put(original_base, modified_future) -> updated_base
  return lens.put(targetDef.initialContext, brokenContext);
}
