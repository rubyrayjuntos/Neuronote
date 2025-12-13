import { AppContext, AppDefinition, MigrationStats } from '../types';

export interface MigrationResult {
  context: AppContext;
  stats: MigrationStats;
}

/**
 * Migrates data from the previous context to the new schema defined in nextDef.
 * Strategy: "Auto-Lens"
 * 1. Matches keys between old and new context.
 * 2. Preserves values for matching keys.
 * 3. Uses new default values for new keys.
 * 4. Discards keys not present in the new schema.
 */
export function migrateContext(prevContext: AppContext, nextDef: AppDefinition): MigrationResult {
  const nextContext = { ...nextDef.initialContext };
  let preserved = 0;
  let dropped = 0;
  let added = 0;
  
  const prevKeysSet = new Set(Object.keys(prevContext));
  const nextKeysSet = new Set(Object.keys(nextContext));
  const droppedKeysList: string[] = [];

  // 1. Preserve & Add
  nextKeysSet.forEach(key => {
    // If the key existed previously (and isn't explicitly private system state starting with _), preserve it.
    // We allow _sys to be reset or migrated cautiously, but for this MVP we usually reset _sys to ensure machine safety.
    if (prevKeysSet.has(key) && !key.startsWith('_')) {
      nextContext[key] = prevContext[key];
      preserved++;
    } else {
      added++;
    }
  });

  // 2. Identify Dropped
  prevKeysSet.forEach(key => {
    if (!nextKeysSet.has(key) && !key.startsWith('_')) {
      dropped++;
      droppedKeysList.push(key);
    }
  });

  return {
    context: nextContext,
    stats: {
      preserved,
      dropped,
      added,
      details: dropped > 0 ? `Dropped: ${droppedKeysList.join(', ')}` : 'Lossless'
    }
  };
}