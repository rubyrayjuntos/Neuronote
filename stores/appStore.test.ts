/**
 * Tests for Zustand App Store
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './appStore';
import { INITIAL_APP } from '../constants';
import type { AppDefinition, SystemLog, ChangeRecord, VerificationReport } from '../types';

/** Create a minimal test ChangeRecord with required fields */
function createTestChangeRecord(overrides: Partial<ChangeRecord> = {}): ChangeRecord {
  const defaultReport: VerificationReport = {
    timestamp: Date.now(),
    passed: true,
    score: 100,
    checks: { structural: [], semantic: [], honesty: [] }
  };
  return {
    id: 'test-change',
    timestamp: Date.now(),
    prompt: 'Test prompt',
    oldDef: INITIAL_APP,
    newDef: { ...INITIAL_APP, version: 'v2' },
    status: 'accepted',
    verificationReport: defaultReport,
    verificationScore: 100,
    diff: { uiNodes: 0, states: 0, dataKeys: 0 },
    latencyMs: 100,
    version: 'v2',
    ...overrides
  };
}

describe('Zustand App Store', () => {
  // Reset store before each test
  beforeEach(() => {
    useAppStore.getState().reset();
  });

  describe('Initial State', () => {
    it('should have INITIAL_APP as default appDef', () => {
      const state = useAppStore.getState();
      expect(state.appDef).toEqual(INITIAL_APP);
    });

    it('should have INITIAL_APP.initialContext as default context', () => {
      const state = useAppStore.getState();
      expect(state.context).toEqual(INITIAL_APP.initialContext);
    });

    it('should start with isLoaded = false', () => {
      const state = useAppStore.getState();
      expect(state.isLoaded).toBe(false);
    });

    it('should start with empty logs', () => {
      const state = useAppStore.getState();
      expect(state.logs).toEqual([]);
    });

    it('should start with viewMode = control', () => {
      const state = useAppStore.getState();
      expect(state.viewMode).toBe('control');
    });
  });

  describe('Core Actions', () => {
    it('setAppDef should update appDef', () => {
      const newDef: AppDefinition = {
        ...INITIAL_APP,
        version: 'test-v2',
      };
      
      useAppStore.getState().setAppDef(newDef);
      
      expect(useAppStore.getState().appDef.version).toBe('test-v2');
    });

    it('setContext should update context', () => {
      const newContext = { foo: 'bar', count: 42 };
      
      useAppStore.getState().setContext(newContext);
      
      expect(useAppStore.getState().context).toEqual(newContext);
    });

    it('updateContext should update a single key', () => {
      useAppStore.getState().setContext({ a: 1, b: 2 });
      useAppStore.getState().updateContext('a', 100);
      
      expect(useAppStore.getState().context.a).toBe(100);
      expect(useAppStore.getState().context.b).toBe(2);
    });

    it('setLoaded should update isLoaded', () => {
      useAppStore.getState().setLoaded(true);
      
      expect(useAppStore.getState().isLoaded).toBe(true);
    });
  });

  describe('AI Actions', () => {
    it('setIsSynthesizing should toggle synthesizing state', () => {
      expect(useAppStore.getState().isSynthesizing).toBe(false);
      
      useAppStore.getState().setIsSynthesizing(true);
      
      expect(useAppStore.getState().isSynthesizing).toBe(true);
    });

    it('setPrompt should update prompt', () => {
      useAppStore.getState().setPrompt('Add a button');
      
      expect(useAppStore.getState().prompt).toBe('Add a button');
    });
  });

  describe('Log Actions', () => {
    it('addLog should append a log entry', () => {
      const log: SystemLog = {
        id: 'log-1',
        timestamp: Date.now(),
        source: 'HOST',
        type: 'INFO',
        message: 'Test log',
      };
      
      useAppStore.getState().addLog(log);
      
      expect(useAppStore.getState().logs).toHaveLength(1);
      expect(useAppStore.getState().logs[0].message).toBe('Test log');
    });

    it('addLog should respect MAX_LOG_ENTRIES limit', () => {
      // Add more logs than the limit
      for (let i = 0; i < 1500; i++) {
        useAppStore.getState().addLog({
          id: `log-${i}`,
          timestamp: Date.now(),
          source: 'HOST',
          type: 'INFO',
          message: `Log ${i}`,
        });
      }
      
      const logs = useAppStore.getState().logs;
      expect(logs.length).toBeLessThanOrEqual(1000); // MAX_LOG_ENTRIES
    });

    it('clearLogs should empty logs array', () => {
      useAppStore.getState().addLog({
        id: 'log-1',
        timestamp: Date.now(),
        source: 'HOST',
        type: 'INFO',
        message: 'Test',
      });
      
      useAppStore.getState().clearLogs();
      
      expect(useAppStore.getState().logs).toEqual([]);
    });
  });

  describe('History Actions', () => {
    it('addChangeRecord should prepend to history', () => {
      const record = createTestChangeRecord({ id: 'change-1', prompt: 'Add button' });
      
      useAppStore.getState().addChangeRecord(record);
      
      expect(useAppStore.getState().changeHistory).toHaveLength(1);
      expect(useAppStore.getState().changeHistory[0].id).toBe('change-1');
    });

    it('updateChangeRecord should modify existing record', () => {
      const record = createTestChangeRecord({ id: 'change-1', prompt: 'Add button' });
      
      useAppStore.getState().addChangeRecord(record);
      useAppStore.getState().updateChangeRecord('change-1', { 
        status: 'rolled_back', 
        failureReason: 'Runtime error' 
      });
      
      const updated = useAppStore.getState().changeHistory[0];
      expect(updated.status).toBe('rolled_back');
      expect(updated.failureReason).toBe('Runtime error');
    });
  });

  describe('Batch Updates', () => {
    it('applyProposal should atomically update appDef, context, and clear synthesizing', () => {
      useAppStore.getState().setIsSynthesizing(true);
      useAppStore.getState().setError('Previous error');
      
      const newDef: AppDefinition = { ...INITIAL_APP, version: 'proposal-v1' };
      const newContext = { result: 'success' };
      
      useAppStore.getState().applyProposal(newDef, newContext);
      
      const state = useAppStore.getState();
      expect(state.appDef.version).toBe('proposal-v1');
      expect(state.context).toEqual(newContext);
      expect(state.isSynthesizing).toBe(false);
      expect(state.error).toBeNull();
    });

    it('rollback should revert to old state and update record', () => {
      const oldDef = INITIAL_APP;
      const newDef: AppDefinition = { ...INITIAL_APP, version: 'broken-v1' };
      const record = createTestChangeRecord({
        id: 'change-rollback',
        prompt: 'Break it',
        oldDef,
        newDef,
      });
      
      // Apply the change first
      useAppStore.getState().addChangeRecord(record);
      useAppStore.getState().setAppDef(newDef);
      
      // Now rollback
      useAppStore.getState().rollback(
        oldDef, 
        { salvaged: true }, 
        'change-rollback', 
        'Runtime crash'
      );
      
      const state = useAppStore.getState();
      expect(state.appDef).toEqual(oldDef);
      expect(state.context).toEqual({ salvaged: true });
      expect(state.changeHistory[0].status).toBe('rolled_back');
      expect(state.changeHistory[0].failureReason).toBe('Runtime crash');
    });
  });

  describe('View Mode', () => {
    it('setViewMode should update viewMode', () => {
      useAppStore.getState().setViewMode('lab');
      expect(useAppStore.getState().viewMode).toBe('lab');
      
      useAppStore.getState().setViewMode('flow');
      expect(useAppStore.getState().viewMode).toBe('flow');
    });
  });

  describe('Reset', () => {
    it('reset should restore initial state', () => {
      // Modify state
      useAppStore.getState().setAppDef({ ...INITIAL_APP, version: 'modified' });
      useAppStore.getState().setContext({ modified: true });
      useAppStore.getState().setLoaded(true);
      useAppStore.getState().addLog({
        id: 'log-1',
        timestamp: Date.now(),
        source: 'HOST',
        type: 'INFO',
        message: 'Test',
      });
      
      // Reset
      useAppStore.getState().reset();
      
      const state = useAppStore.getState();
      expect(state.appDef).toEqual(INITIAL_APP);
      expect(state.context).toEqual(INITIAL_APP.initialContext);
      expect(state.isLoaded).toBe(false);
      expect(state.logs).toEqual([]);
    });
  });

  describe('Immer Immutability', () => {
    it('should maintain immutability when updating context', () => {
      const initialContext = useAppStore.getState().context;
      
      useAppStore.getState().updateContext('newKey', 'newValue');
      
      const updatedContext = useAppStore.getState().context;
      
      // Should be different objects
      expect(initialContext).not.toBe(updatedContext);
    });

    it('should maintain immutability when adding logs', () => {
      const initialLogs = useAppStore.getState().logs;
      
      useAppStore.getState().addLog({
        id: 'log-1',
        timestamp: Date.now(),
        source: 'HOST',
        type: 'INFO',
        message: 'Test',
      });
      
      const updatedLogs = useAppStore.getState().logs;
      
      // Should be different arrays
      expect(initialLogs).not.toBe(updatedLogs);
    });
  });
});
