/**
 * Zustand Store for NeuroNote Application State
 * 
 * Replaces React useState with centralized, performant state management.
 * Uses Immer for immutable updates and DevTools for debugging.
 * 
 * Benefits:
 * - Single source of truth for all app state
 * - Automatic re-render optimization via selectors
 * - Immutable updates with Immer (write mutable syntax, get immutable results)
 * - DevTools integration for debugging
 * - Easy state persistence
 * 
 * @module stores/appStore
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import type { 
  AppDefinition, 
  AppContext, 
  SystemLog, 
  VerificationReport, 
  ChangeRecord, 
  InteractionTrace 
} from '../types';
import type { AIProvider } from '../services/ai/types';
import { INITIAL_APP, MAX_LOG_ENTRIES, MAX_INTERACTION_TRACES, MAX_JOURNAL_ENTRIES } from '../constants';

// ============================================================================
// STATE TYPES
// ============================================================================

export interface AppState {
  // Core Application State
  appDef: AppDefinition;
  context: AppContext;
  isLoaded: boolean;
  
  // AI State
  aiProvider: AIProvider | null;
  isSynthesizing: boolean;
  prompt: string;
  
  // Validation State
  verificationReport: VerificationReport | null;
  error: string | null;
  
  // Observability State
  logs: SystemLog[];
  changeHistory: ChangeRecord[];
  interactions: InteractionTrace[];
  viewMode: 'control' | 'lab' | 'flow';
  
  // Manifest (loaded from server)
  manifest: unknown | null;
}

export interface AppActions {
  // Core Actions
  setAppDef: (def: AppDefinition) => void;
  setContext: (ctx: AppContext) => void;
  updateContext: (key: string, value: unknown) => void;
  setLoaded: (loaded: boolean) => void;
  
  // AI Actions
  setAiProvider: (provider: AIProvider) => void;
  setIsSynthesizing: (synthesizing: boolean) => void;
  setPrompt: (prompt: string) => void;
  
  // Validation Actions
  setVerificationReport: (report: VerificationReport | null) => void;
  setError: (error: string | null) => void;
  
  // Log Actions
  addLog: (log: SystemLog) => void;
  clearLogs: () => void;
  
  // History Actions
  addChangeRecord: (record: ChangeRecord) => void;
  updateChangeRecord: (id: string, updates: Partial<ChangeRecord>) => void;
  setChangeHistory: (history: ChangeRecord[]) => void;
  
  // Interaction Tracing
  recordInteraction: (trace: InteractionTrace) => void;
  
  // View Mode
  setViewMode: (mode: 'control' | 'lab' | 'flow') => void;
  
  // Manifest
  setManifest: (manifest: unknown) => void;
  
  // Batch Updates (for atomic state changes)
  applyProposal: (newDef: AppDefinition, newContext: AppContext) => void;
  rollback: (oldDef: AppDefinition, salvagedContext: AppContext, recordId: string, reason: string) => void;
  
  // Reset
  reset: () => void;
}

export type AppStore = AppState & AppActions;

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: AppState = {
  appDef: INITIAL_APP,
  context: INITIAL_APP.initialContext,
  isLoaded: false,
  
  aiProvider: null,
  isSynthesizing: false,
  prompt: '',
  
  verificationReport: null,
  error: null,
  
  logs: [],
  changeHistory: [],
  interactions: [],
  viewMode: 'control',
  
  manifest: null,
};

// ============================================================================
// STORE CREATION
// ============================================================================

export const useAppStore = create<AppStore>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        ...initialState,
        
        // ===== Core Actions =====
        
        setAppDef: (def) => set((state) => {
          state.appDef = def;
        }),
        
        setContext: (ctx) => set((state) => {
          state.context = ctx;
        }),
        
        updateContext: (key, value) => set((state) => {
          state.context[key] = value;
        }),
        
        setLoaded: (loaded) => set((state) => {
          state.isLoaded = loaded;
        }),
        
        // ===== AI Actions =====
        
        setAiProvider: (provider) => set((state) => {
          state.aiProvider = provider;
        }),
        
        setIsSynthesizing: (synthesizing) => set((state) => {
          state.isSynthesizing = synthesizing;
        }),
        
        setPrompt: (prompt) => set((state) => {
          state.prompt = prompt;
        }),
        
        // ===== Validation Actions =====
        
        setVerificationReport: (report) => set((state) => {
          state.verificationReport = report;
        }),
        
        setError: (error) => set((state) => {
          state.error = error;
        }),
        
        // ===== Log Actions =====
        
        addLog: (log) => set((state) => {
          state.logs.push(log);
          // Keep only last MAX_LOG_ENTRIES
          if (state.logs.length > MAX_LOG_ENTRIES) {
            state.logs = state.logs.slice(-MAX_LOG_ENTRIES);
          }
        }),
        
        clearLogs: () => set((state) => {
          state.logs = [];
        }),
        
        // ===== History Actions =====
        
        addChangeRecord: (record) => set((state) => {
          state.changeHistory.unshift(record);
          // Keep only last MAX_JOURNAL_ENTRIES
          if (state.changeHistory.length > MAX_JOURNAL_ENTRIES) {
            state.changeHistory = state.changeHistory.slice(0, MAX_JOURNAL_ENTRIES);
          }
        }),
        
        updateChangeRecord: (id, updates) => set((state) => {
          const index = state.changeHistory.findIndex(r => r.id === id);
          if (index !== -1) {
            Object.assign(state.changeHistory[index], updates);
          }
        }),
        
        setChangeHistory: (history) => set((state) => {
          state.changeHistory = history;
        }),
        
        // ===== Interaction Tracing =====
        
        recordInteraction: (trace) => set((state) => {
          state.interactions.push(trace);
          // Keep only last MAX_INTERACTION_TRACES
          if (state.interactions.length > MAX_INTERACTION_TRACES) {
            state.interactions = state.interactions.slice(-MAX_INTERACTION_TRACES);
          }
        }),
        
        // ===== View Mode =====
        
        setViewMode: (mode) => set((state) => {
          state.viewMode = mode;
        }),
        
        // ===== Manifest =====
        
        setManifest: (manifest) => set((state) => {
          state.manifest = manifest;
        }),
        
        // ===== Batch Updates =====
        
        applyProposal: (newDef, newContext) => set((state) => {
          state.appDef = newDef;
          state.context = newContext;
          state.isSynthesizing = false;
          state.error = null;
        }),
        
        rollback: (oldDef, salvagedContext, recordId, reason) => set((state) => {
          state.appDef = oldDef;
          state.context = salvagedContext;
          
          // Update the change record
          const index = state.changeHistory.findIndex(r => r.id === recordId);
          if (index !== -1) {
            state.changeHistory[index].status = 'rolled_back';
            state.changeHistory[index].failureReason = reason;
          }
        }),
        
        // ===== Reset =====
        
        reset: () => set(() => initialState),
      }))
    ),
    { name: 'NeuroNote' }
  )
);

// ============================================================================
// SELECTORS (for optimized re-renders)
// ============================================================================

/**
 * Shallow selector for core app state
 */
export const selectAppDef = (state: AppStore) => state.appDef;
export const selectContext = (state: AppStore) => state.context;
export const selectIsLoaded = (state: AppStore) => state.isLoaded;

/**
 * Shallow selector for AI state
 */
export const selectAiProvider = (state: AppStore) => state.aiProvider;
export const selectIsSynthesizing = (state: AppStore) => state.isSynthesizing;
export const selectPrompt = (state: AppStore) => state.prompt;

/**
 * Shallow selector for validation state
 */
export const selectVerificationReport = (state: AppStore) => state.verificationReport;
export const selectError = (state: AppStore) => state.error;

/**
 * Shallow selector for observability
 */
export const selectLogs = (state: AppStore) => state.logs;
export const selectChangeHistory = (state: AppStore) => state.changeHistory;
export const selectInteractions = (state: AppStore) => state.interactions;
export const selectViewMode = (state: AppStore) => state.viewMode;

/**
 * Shallow selector for manifest
 */
export const selectManifest = (state: AppStore) => state.manifest;

/**
 * Composite selectors for common patterns
 */
export const selectRuntimeState = (state: AppStore) => ({
  appDef: state.appDef,
  context: state.context,
  isLoaded: state.isLoaded,
});

export const selectAiState = (state: AppStore) => ({
  aiProvider: state.aiProvider,
  isSynthesizing: state.isSynthesizing,
  prompt: state.prompt,
});

export const selectObservabilityState = (state: AppStore) => ({
  logs: state.logs,
  changeHistory: state.changeHistory,
  interactions: state.interactions,
  viewMode: state.viewMode,
});

// ============================================================================
// HOOKS (convenience wrappers)
// ============================================================================

/**
 * Hook for core app actions only (no state subscription)
 */
export const useAppActions = () => useAppStore((state) => ({
  setAppDef: state.setAppDef,
  setContext: state.setContext,
  updateContext: state.updateContext,
  addLog: state.addLog,
  addChangeRecord: state.addChangeRecord,
  recordInteraction: state.recordInteraction,
  applyProposal: state.applyProposal,
  rollback: state.rollback,
  setError: state.setError,
  setVerificationReport: state.setVerificationReport,
  setIsSynthesizing: state.setIsSynthesizing,
  setPrompt: state.setPrompt,
  setViewMode: state.setViewMode,
  setManifest: state.setManifest,
  setLoaded: state.setLoaded,
  setAiProvider: state.setAiProvider,
  setChangeHistory: state.setChangeHistory,
}));
