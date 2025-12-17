import { AppDefinition, AppContext, ChangeRecord } from '../types';
import { MAX_JOURNAL_ENTRIES } from '../constants';

const SNAPSHOT_KEY = 'neuronote_snapshot_v1';
const JOURNAL_KEY = 'neuronote_journal_v1';

export interface Snapshot {
  definition: AppDefinition;
  context: AppContext;
  timestamp: number;
}

export const Persistence = {
  // --- SNAPSHOTS (Current State) ---
  save: (definition: AppDefinition, context: AppContext) => {
    try {
      const snapshot: Snapshot = {
        definition,
        context,
        timestamp: Date.now()
      };
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
      return true;
    } catch (e) {
      console.error("Persistence Write Error", e);
      return false;
    }
  },

  load: (): Snapshot | null => {
    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as Snapshot;
    } catch (e) {
      console.error("Persistence Read Error", e);
      return null;
    }
  },

  // --- JOURNAL (History) ---
  saveJournal: (journal: ChangeRecord[]) => {
      try {
          // Limit entries to prevent QuotaExceededError
          const trimmed = journal.slice(0, MAX_JOURNAL_ENTRIES); 
          localStorage.setItem(JOURNAL_KEY, JSON.stringify(trimmed));
          return true;
      } catch (e) {
          console.error("Journal Write Error", e);
          return false;
      }
  },

  loadJournal: (): ChangeRecord[] => {
      try {
          const raw = localStorage.getItem(JOURNAL_KEY);
          if (!raw) return [];
          return JSON.parse(raw) as ChangeRecord[];
      } catch (e) {
          console.error("Journal Read Error", e);
          return [];
      }
  },

  reset: () => {
    localStorage.removeItem(SNAPSHOT_KEY);
    localStorage.removeItem(JOURNAL_KEY);
  }
};
