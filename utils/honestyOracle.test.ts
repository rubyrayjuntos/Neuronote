/**
 * HONESTY ORACLE TESTS
 * 
 * Tests for semantic attack detection - the system that detects
 * "valid but wrong" AI proposals that don't match user intent.
 * 
 * This is security-critical code that prevents malicious or
 * confused AI outputs from being executed.
 */

import { describe, it, expect } from 'vitest';
import {
  extractIntent,
  runHonestyOracle,
  formatHonestyReport,
  IntentSignal,
  HonestyCheckResult,
} from './honestyOracle';
import { AppDefinition } from '../types';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createMinimalApp = (overrides: Partial<AppDefinition> = {}): AppDefinition => ({
  version: 'v2025-12-23-00:00',
  initialContext: {},
  machine: {
    initial: 'idle',
    states: { idle: { on: {} } },
  },
  view: {
    id: 'root',
    type: 'container',
    props: {},
    children: [],
  },
  pipelines: {},
  testVectors: [],
  ...overrides,
});

const createAppWithFileInput = (): AppDefinition => createMinimalApp({
  view: {
    id: 'root',
    type: 'container',
    props: {},
    children: [
      { id: 'upload', type: 'file-input', props: {}, children: [] },
    ],
  },
});

const createAppWithPipelines = (nodeCount: number): AppDefinition => createMinimalApp({
  initialContext: { input: '', result: '' },
  pipelines: {
    process: {
      inputs: { input: 'string' },
      nodes: Array.from({ length: nodeCount }, (_, i) => ({
        id: `n${i}`,
        op: 'Text.ToUpper',
        inputs: { text: i === 0 ? '$input' : `@n${i - 1}` },
      })),
      output: `n${nodeCount - 1}`,
    },
  },
});

const createAppWithSensitiveKey = (): AppDefinition => createMinimalApp({
  initialContext: {
    password: 'secret123',
    displayValue: '',
  },
  view: {
    id: 'root',
    type: 'container',
    props: {},
    children: [
      { id: 'display', type: 'text', textBinding: 'displayValue', props: {}, children: [] },
    ],
  },
  pipelines: {
    expose: {
      inputs: { password: 'string' },
      nodes: [
        { id: 'n1', op: 'Text.ToUpper', inputs: { text: '$password' } },
      ],
      output: 'n1',
    },
  },
});

// ============================================================================
// INTENT EXTRACTION TESTS
// ============================================================================

describe('Intent Extraction', () => {
  describe('extractIntent', () => {
    it('should detect data input intent', () => {
      const signals = extractIntent('upload an image file');
      
      expect(signals.some(s => s.category === 'data_input')).toBe(true);
    });

    it('should detect data output intent', () => {
      const signals = extractIntent('save the result to a file');
      
      expect(signals.some(s => s.category === 'data_output')).toBe(true);
    });

    it('should detect data transform intent', () => {
      const signals = extractIntent('convert the text to uppercase');
      
      expect(signals.some(s => s.category === 'data_transform')).toBe(true);
    });

    it('should detect UI display intent', () => {
      const signals = extractIntent('show me a chart of the data');
      
      expect(signals.some(s => s.category === 'ui_display')).toBe(true);
    });

    it('should detect interaction intent', () => {
      const signals = extractIntent('add a button to toggle the mode');
      
      expect(signals.some(s => s.category === 'interaction')).toBe(true);
    });

    it('should detect negations', () => {
      const signals = extractIntent("don't upload any files");
      
      const inputSignal = signals.find(s => s.category === 'data_input');
      expect(inputSignal?.negations.length).toBeGreaterThan(0);
    });

    it('should return unknown for unrecognized prompts', () => {
      const signals = extractIntent('xyzzy plugh');
      
      expect(signals.some(s => s.category === 'unknown')).toBe(true);
    });

    it('should detect multiple intents', () => {
      const signals = extractIntent('upload an image and display it as a chart');
      
      expect(signals.some(s => s.category === 'data_input')).toBe(true);
      expect(signals.some(s => s.category === 'ui_display')).toBe(true);
    });

    it('should be case-insensitive', () => {
      const lowerSignals = extractIntent('upload a file');
      const upperSignals = extractIntent('UPLOAD A FILE');
      
      expect(lowerSignals.some(s => s.category === 'data_input')).toBe(true);
      expect(upperSignals.some(s => s.category === 'data_input')).toBe(true);
    });
  });
});

// ============================================================================
// HONESTY CHECK TESTS
// ============================================================================

describe('Honesty Oracle Checks', () => {
  describe('runHonestyOracle', () => {
    it('should pass for matching intent and proposal', () => {
      const previous = createMinimalApp();
      const proposal = createAppWithFileInput();
      const prompt = 'add a file upload';
      
      const result = runHonestyOracle(prompt, proposal, previous);
      
      expect(result.passed).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should warn when user requests input but proposal lacks it', () => {
      const previous = createMinimalApp();
      const proposal = createMinimalApp(); // No file input
      const prompt = 'upload an image file';
      
      const result = runHonestyOracle(prompt, proposal, previous);
      
      expect(result.concerns.some(c => c.type === 'intent_mismatch')).toBe(true);
    });

    it('should pass for simple transformations', () => {
      const previous = createMinimalApp();
      const proposal = createAppWithPipelines(3);
      const prompt = 'convert the text through multiple transformations';
      
      const result = runHonestyOracle(prompt, proposal, previous);
      
      expect(result.passed).toBe(true);
    });

    it('should warn about complexity explosion', () => {
      const previous = createMinimalApp();
      const proposal = createAppWithPipelines(20); // Lots of nodes
      const prompt = 'hi'; // Very short prompt
      
      const result = runHonestyOracle(prompt, proposal, previous);
      
      expect(result.concerns.some(c => c.type === 'scope_creep')).toBe(true);
    });

    it('should flag sensitive data flow', () => {
      const previous = createMinimalApp();
      const proposal = createAppWithSensitiveKey();
      const prompt = 'process the password';
      
      const result = runHonestyOracle(prompt, proposal, previous);
      
      expect(result.concerns.some(c => c.type === 'data_exfiltration')).toBe(true);
    });

    it('should detect suspicious new context keys', () => {
      const previous = createMinimalApp({ initialContext: { task: '' } });
      const proposal = createMinimalApp({ 
        initialContext: { 
          task: '', 
          unrelatedXyzzy: 'value' 
        } 
      });
      const prompt = 'add a task list';
      
      const result = runHonestyOracle(prompt, proposal, previous);
      
      expect(result.concerns.some(c => 
        c.type === 'suspicious_binding' && 
        c.message.includes('unrelatedXyzzy')
      )).toBe(true);
    });

    it('should not flag common context key names', () => {
      const previous = createMinimalApp({ initialContext: {} });
      const proposal = createMinimalApp({ 
        initialContext: { result: '', value: '', output: '' } 
      });
      const prompt = 'process something';
      
      const result = runHonestyOracle(prompt, proposal, previous);
      
      // Common keys like result, value, output should not be flagged
      const suspiciousBindings = result.concerns.filter(c => c.type === 'suspicious_binding');
      expect(suspiciousBindings.length).toBe(0);
    });
  });

  describe('Confidence scoring', () => {
    it('should have high confidence with no concerns', () => {
      const previous = createMinimalApp();
      const proposal = createMinimalApp();
      const prompt = 'make a simple app';
      
      const result = runHonestyOracle(prompt, proposal, previous);
      
      expect(result.confidence).toBe(1);
    });

    it('should reduce confidence for warnings', () => {
      const previous = createMinimalApp();
      const proposal = createMinimalApp({ 
        initialContext: { suspiciousXyzzy: 'value' } 
      });
      const prompt = 'make a simple app';
      
      const result = runHonestyOracle(prompt, proposal, previous);
      
      expect(result.confidence).toBeLessThan(1);
    });

    it('should fail for critical concerns', () => {
      const previous = createMinimalApp();
      const proposal = createAppWithSensitiveKey();
      const prompt = 'process sensitive data';
      
      const result = runHonestyOracle(prompt, proposal, previous);
      
      // Should have critical concern and fail
      expect(result.concerns.some(c => c.severity === 'critical')).toBe(true);
      expect(result.passed).toBe(false);
    });
  });
});

// ============================================================================
// REPORT FORMATTING TESTS
// ============================================================================

describe('Report Formatting', () => {
  describe('formatHonestyReport', () => {
    it('should format passing result', () => {
      const result: HonestyCheckResult = {
        passed: true,
        confidence: 1,
        concerns: [],
      };
      
      const report = formatHonestyReport(result);
      
      expect(report).toContain('PASSED');
      expect(report).toContain('100%');
    });

    it('should format passing with warnings', () => {
      const result: HonestyCheckResult = {
        passed: true,
        confidence: 0.9,
        concerns: [{
          severity: 'warning',
          type: 'intent_mismatch',
          message: 'Minor issue',
          evidence: {},
        }],
      };
      
      const report = formatHonestyReport(result);
      
      expect(report).toContain('PASSED with warnings');
      expect(report).toContain('⚠️');
    });

    it('should format failed result', () => {
      const result: HonestyCheckResult = {
        passed: false,
        confidence: 0.3,
        concerns: [{
          severity: 'critical',
          type: 'data_exfiltration',
          message: 'Critical issue',
          evidence: {},
        }],
      };
      
      const report = formatHonestyReport(result);
      
      expect(report).toContain('FAILED');
      expect(report).toContain('🚨');
    });

    it('should include concern messages', () => {
      const result: HonestyCheckResult = {
        passed: false,
        confidence: 0.5,
        concerns: [{
          severity: 'critical',
          type: 'scope_creep',
          message: 'Complexity explosion detected',
          evidence: {},
        }],
      };
      
      const report = formatHonestyReport(result);
      
      expect(report).toContain('Complexity explosion detected');
      expect(report).toContain('scope_creep');
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty prompt', () => {
    const previous = createMinimalApp();
    const proposal = createMinimalApp();
    
    expect(() => runHonestyOracle('', proposal, previous)).not.toThrow();
  });

  it('should handle minimal proposals', () => {
    const previous = createMinimalApp();
    const proposal = createMinimalApp();
    
    const result = runHonestyOracle('do nothing', proposal, previous);
    
    expect(result.passed).toBe(true);
  });

  it('should handle proposals with no pipelines', () => {
    const previous = createMinimalApp();
    const proposal = createMinimalApp({ pipelines: undefined as any });
    
    expect(() => runHonestyOracle('simple test', proposal, previous)).not.toThrow();
  });

  it('should handle deeply nested views', () => {
    const createNestedView = (depth: number): any => {
      if (depth === 0) return { id: `leaf`, type: 'text', props: {}, children: [] };
      return {
        id: `level${depth}`,
        type: 'container',
        props: {},
        children: [createNestedView(depth - 1)],
      };
    };
    
    const previous = createMinimalApp();
    const proposal = createMinimalApp({ view: createNestedView(10) });
    
    expect(() => runHonestyOracle('nested test', proposal, previous)).not.toThrow();
  });

  it('should handle special characters in prompts', () => {
    const previous = createMinimalApp();
    const proposal = createMinimalApp();
    
    expect(() => 
      runHonestyOracle('add <script>alert("xss")</script>', proposal, previous)
    ).not.toThrow();
  });
});
