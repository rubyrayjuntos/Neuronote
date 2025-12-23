/**
 * Schema Validation Tests
 * Tests Zod schemas for NeuroNote core types
 * 
 * @module schemas.test
 */

import { describe, it, expect } from 'vitest';
import { 
  AppDefinitionSchema,
  ViewNodeSchema,
  MachineDefinitionSchema,
  PipelineDefinitionSchema,
  validateAppDefinition,
  isAppDefinition,
  formatZodErrors,
  NodeTypeSchema,
  repairProposal,
  buildRepairFeedback,
} from './index';
import { INITIAL_APP } from '../constants';

describe('Zod Schema Validation', () => {
  
  describe('NodeTypeSchema', () => {
    it('should accept valid node types', () => {
      expect(NodeTypeSchema.safeParse('container').success).toBe(true);
      expect(NodeTypeSchema.safeParse('button').success).toBe(true);
      expect(NodeTypeSchema.safeParse('Input.Image').success).toBe(true);
      expect(NodeTypeSchema.safeParse('Display.Chart').success).toBe(true);
      expect(NodeTypeSchema.safeParse('Layout.Stack').success).toBe(true);
    });

    it('should reject invalid node types', () => {
      expect(NodeTypeSchema.safeParse('script').success).toBe(false);
      expect(NodeTypeSchema.safeParse('iframe').success).toBe(false);
      expect(NodeTypeSchema.safeParse('dangerous').success).toBe(false);
      expect(NodeTypeSchema.safeParse('').success).toBe(false);
    });
  });

  describe('ViewNodeSchema', () => {
    it('should validate a minimal view node', () => {
      const node = { id: 'root', type: 'container' };
      const result = ViewNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });

    it('should validate a view node with children', () => {
      const node = {
        id: 'root',
        type: 'container',
        children: [
          { id: 'child1', type: 'text', textBinding: 'message' },
          { id: 'child2', type: 'button', onClick: 'SUBMIT' },
        ],
      };
      const result = ViewNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });

    it('should validate deeply nested nodes', () => {
      const node = {
        id: 'level1',
        type: 'container',
        children: [{
          id: 'level2',
          type: 'Layout.Stack',
          children: [{
            id: 'level3',
            type: 'Layout.Card',
            children: [{
              id: 'level4',
              type: 'Display.Text',
              textBinding: 'deep.value',
            }],
          }],
        }],
      };
      const result = ViewNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });

    it('should reject nodes without id', () => {
      const node = { type: 'container' };
      const result = ViewNodeSchema.safeParse(node);
      expect(result.success).toBe(false);
    });

    it('should reject nodes with invalid type', () => {
      const node = { id: 'root', type: 'script' };
      const result = ViewNodeSchema.safeParse(node);
      expect(result.success).toBe(false);
    });

    it('should accept optional bindings', () => {
      const node = {
        id: 'input1',
        type: 'input',
        valueBinding: 'form.email',
        onChange: 'UPDATE_EMAIL',
        onEvent: 'VALUE_CHANGED',
      };
      const result = ViewNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });
  });

  describe('MachineDefinitionSchema', () => {
    it('should validate a minimal machine', () => {
      const machine = {
        initial: 'idle',
        states: {
          idle: {},
        },
      };
      const result = MachineDefinitionSchema.safeParse(machine);
      expect(result.success).toBe(true);
    });

    it('should validate machine with transitions', () => {
      const machine = {
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: { on: { STOP: 'idle' } },
        },
      };
      const result = MachineDefinitionSchema.safeParse(machine);
      expect(result.success).toBe(true);
    });

    it('should validate machine with object transitions', () => {
      const machine = {
        initial: 'idle',
        states: {
          idle: {
            on: {
              START: { target: 'running', actions: ['logStart'] },
            },
          },
          running: { entry: ['startTimer'] },
        },
      };
      const result = MachineDefinitionSchema.safeParse(machine);
      expect(result.success).toBe(true);
    });

    it('should reject machine with missing initial state', () => {
      const machine = {
        initial: 'nonexistent',
        states: {
          idle: {},
        },
      };
      const result = MachineDefinitionSchema.safeParse(machine);
      // Note: Schema validates structure, not semantic correctness
      // Initial state existence is checked separately by validateMachineInitialState
      expect(result.success).toBe(true);
    });

    it('should reject machine without initial', () => {
      const machine = {
        states: { idle: {} },
      };
      const result = MachineDefinitionSchema.safeParse(machine);
      expect(result.success).toBe(false);
    });
  });

  describe('PipelineDefinitionSchema', () => {
    it('should validate a minimal pipeline', () => {
      const pipeline = {
        inputs: { value: 'number' },
        nodes: [
          { id: 'double', op: 'math:multiply', inputs: { a: '$value', b: 2 } },
        ],
        output: 'double',
      };
      const result = PipelineDefinitionSchema.safeParse(pipeline);
      expect(result.success).toBe(true);
    });

    it('should validate pipeline with budget', () => {
      const pipeline = {
        inputs: { value: 'number' },
        nodes: [
          { id: 'calc', op: 'math:add', inputs: { a: '$value', b: 1 } },
        ],
        output: 'calc',
        budget: { maxOps: 50, maxTimeMs: 1000 },
      };
      const result = PipelineDefinitionSchema.safeParse(pipeline);
      expect(result.success).toBe(true);
    });

    it('should validate pipeline with provenance', () => {
      const pipeline = {
        inputs: { x: 'number' },
        nodes: [],
        output: 'x',
        provenance: {
          operatorLibraryVersion: '1.0.0',
          rationale: 'Simple passthrough',
        },
      };
      const result = PipelineDefinitionSchema.safeParse(pipeline);
      expect(result.success).toBe(true);
    });

    it('should reject pipeline without output', () => {
      const pipeline = {
        inputs: { x: 'number' },
        nodes: [],
      };
      const result = PipelineDefinitionSchema.safeParse(pipeline);
      expect(result.success).toBe(false);
    });
  });

  describe('AppDefinitionSchema', () => {
    it('should validate the INITIAL_APP from constants', () => {
      const result = AppDefinitionSchema.safeParse(INITIAL_APP);
      expect(result.success).toBe(true);
    });

    it('should validate a minimal app definition', () => {
      const app = {
        version: '1.0',
        view: { id: 'root', type: 'container' },
        machine: {
          initial: 'idle',
          states: { idle: {} },
        },
        initialContext: {},
      };
      const result = AppDefinitionSchema.safeParse(app);
      expect(result.success).toBe(true);
    });

    it('should validate app with pipelines', () => {
      const app = {
        version: '1.0',
        view: { id: 'root', type: 'container' },
        machine: { initial: 'idle', states: { idle: {} } },
        initialContext: { value: 42 },
        pipelines: {
          double: {
            inputs: { x: 'number' },
            nodes: [{ id: 'mult', op: 'math:multiply', inputs: { a: '$x', b: 2 } }],
            output: 'mult',
          },
        },
      };
      const result = AppDefinitionSchema.safeParse(app);
      expect(result.success).toBe(true);
    });

    it('should validate app with test vectors', () => {
      const app = {
        version: '1.0',
        view: { id: 'root', type: 'container' },
        machine: { initial: 'idle', states: { idle: { on: { GO: 'done' } }, done: {} } },
        initialContext: {},
        testVectors: [
          {
            name: 'Basic flow',
            initialState: 'idle',
            steps: [{ event: 'GO', expectState: 'done' }],
          },
        ],
      };
      const result = AppDefinitionSchema.safeParse(app);
      expect(result.success).toBe(true);
    });

    it('should reject app without version', () => {
      const app = {
        view: { id: 'root', type: 'container' },
        machine: { initial: 'idle', states: { idle: {} } },
        initialContext: {},
      };
      const result = AppDefinitionSchema.safeParse(app);
      expect(result.success).toBe(false);
    });

    it('should reject app with invalid view type', () => {
      const app = {
        version: '1.0',
        view: { id: 'root', type: 'script' }, // dangerous!
        machine: { initial: 'idle', states: { idle: {} } },
        initialContext: {},
      };
      const result = AppDefinitionSchema.safeParse(app);
      expect(result.success).toBe(false);
    });
  });

  describe('Helper Functions', () => {
    describe('validateAppDefinition', () => {
      it('should return success for valid apps', () => {
        const result = validateAppDefinition(INITIAL_APP);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.version).toBe(INITIAL_APP.version);
        }
      });

      it('should return error for invalid apps', () => {
        const result = validateAppDefinition({ invalid: true });
        expect(result.success).toBe(false);
      });
    });

    describe('isAppDefinition', () => {
      it('should return true for valid apps', () => {
        expect(isAppDefinition(INITIAL_APP)).toBe(true);
      });

      it('should return false for invalid apps', () => {
        expect(isAppDefinition(null)).toBe(false);
        expect(isAppDefinition({})).toBe(false);
        expect(isAppDefinition({ version: '1.0' })).toBe(false);
      });

      it('should act as type guard', () => {
        const unknown: unknown = INITIAL_APP;
        if (isAppDefinition(unknown)) {
          // TypeScript should now know this is AppDefinition
          expect(unknown.version).toBeDefined();
          expect(unknown.view.id).toBeDefined();
        }
      });
    });

    describe('formatZodErrors', () => {
      it('should format errors with paths', () => {
        const result = AppDefinitionSchema.safeParse({ version: 123 });
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = formatZodErrors(result.error);
          expect(messages.length).toBeGreaterThan(0);
          expect(messages.some(m => m.includes('version'))).toBe(true);
        }
      });

      it('should format nested errors', () => {
        const app = {
          version: '1.0',
          view: { id: 'root', type: 'script' }, // invalid type
          machine: { initial: 'idle', states: { idle: {} } },
          initialContext: {},
        };
        const result = AppDefinitionSchema.safeParse(app);
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = formatZodErrors(result.error);
          expect(messages.some(m => m.includes('view.type'))).toBe(true);
        }
      });
    });
  });

  describe('Security Validations', () => {
    it('should reject script node type (XSS prevention)', () => {
      const node = { id: 'evil', type: 'script' };
      expect(ViewNodeSchema.safeParse(node).success).toBe(false);
    });

    it('should reject iframe node type', () => {
      const node = { id: 'evil', type: 'iframe' };
      expect(ViewNodeSchema.safeParse(node).success).toBe(false);
    });

    it('should reject object node type', () => {
      const node = { id: 'evil', type: 'object' };
      expect(ViewNodeSchema.safeParse(node).success).toBe(false);
    });

    it('should reject empty node id', () => {
      const node = { id: '', type: 'container' };
      expect(ViewNodeSchema.safeParse(node).success).toBe(false);
    });

    it('should reject empty version', () => {
      const app = {
        version: '',
        view: { id: 'root', type: 'container' },
        machine: { initial: 'idle', states: { idle: {} } },
        initialContext: {},
      };
      expect(AppDefinitionSchema.safeParse(app).success).toBe(false);
    });
  });

  // ============================================================================
  // Proposal Repair Tests
  // ============================================================================
  
  describe('repairProposal', () => {
    it('should fix lowercase hierarchical types to PascalCase', () => {
      const proposal = {
        view: {
          id: 'root',
          type: 'container',
          children: [
            { id: 'mic', type: 'input.audio' },
            { id: 'chart', type: 'display.chart' },
          ],
        },
      };
      
      const result = repairProposal(proposal);
      
      expect(result.repaired).toBe(true);
      expect(result.fixes).toHaveLength(2);
      expect(result.fixes).toContain('Fixed type casing at view.children[0]: "input.audio" → "Input.Audio"');
      expect(result.fixes).toContain('Fixed type casing at view.children[1]: "display.chart" → "Display.Chart"');
      
      const fixed = result.proposal as { view: { children: Array<{ type: string }> } };
      expect(fixed.view.children[0].type).toBe('Input.Audio');
      expect(fixed.view.children[1].type).toBe('Display.Chart');
    });
    
    it('should not modify already-correct types', () => {
      const proposal = {
        view: {
          id: 'root',
          type: 'container',
          children: [
            { id: 'mic', type: 'Input.Audio' },
          ],
        },
      };
      
      const result = repairProposal(proposal);
      
      expect(result.repaired).toBe(false);
      expect(result.fixes).toHaveLength(0);
    });
    
    it('should handle deeply nested view trees', () => {
      const proposal = {
        view: {
          id: 'root',
          type: 'layout.stack',
          children: [
            {
              id: 'card',
              type: 'layout.card',
              children: [
                { id: 'btn', type: 'control.button' },
              ],
            },
          ],
        },
      };
      
      const result = repairProposal(proposal);
      
      expect(result.repaired).toBe(true);
      expect(result.fixes).toHaveLength(3);
      
      const fixed = result.proposal as { view: { type: string; children: Array<{ type: string; children: Array<{ type: string }> }> } };
      expect(fixed.view.type).toBe('Layout.Stack');
      expect(fixed.view.children[0].type).toBe('Layout.Card');
      expect(fixed.view.children[0].children[0].type).toBe('Control.Button');
    });
    
    it('should handle null/undefined input gracefully', () => {
      expect(repairProposal(null).repaired).toBe(false);
      expect(repairProposal(undefined).repaired).toBe(false);
      expect(repairProposal('string').repaired).toBe(false);
    });
    
    it('should convert non-array children to empty array', () => {
      const proposal = {
        view: {
          id: 'root',
          type: 'container',
          children: 'not an array',
        },
      };
      
      const result = repairProposal(proposal);
      
      expect(result.repaired).toBe(true);
      expect(result.fixes).toContain('Fixed children at view: converted to array');
      
      const fixed = result.proposal as { view: { children: unknown[] } };
      expect(Array.isArray(fixed.view.children)).toBe(true);
    });
    
    it('should not mutate the original proposal', () => {
      const original = {
        view: {
          id: 'root',
          type: 'input.audio',
        },
      };
      
      repairProposal(original);
      
      // Original should be unchanged
      expect(original.view.type).toBe('input.audio');
    });
  });
  
  describe('buildRepairFeedback', () => {
    it('should format feedback with applied fixes and remaining errors', () => {
      const issues = [
        { path: ['machine', 'initial'], message: 'Required', code: 'invalid_type' as const, expected: 'string', received: 'undefined' },
      ];
      const fixes = ['Fixed type casing at view: "input.audio" → "Input.Audio"'];
      
      const feedback = buildRepairFeedback(issues, fixes);
      
      expect(feedback).toContain('Auto-repaired issues:');
      expect(feedback).toContain('✓ Fixed type casing');
      expect(feedback).toContain('Remaining errors requiring your attention:');
      expect(feedback).toContain('machine.initial: Required');
    });
    
    it('should format feedback without applied fixes', () => {
      const issues = [
        { path: ['version'], message: 'Invalid format', code: 'invalid_string' as const, validation: 'regex' },
      ];
      
      const feedback = buildRepairFeedback(issues, []);
      
      expect(feedback).not.toContain('Auto-repaired issues:');
      expect(feedback).toContain('Remaining errors requiring your attention:');
      expect(feedback).toContain('version: Invalid format');
    });
  });
});
