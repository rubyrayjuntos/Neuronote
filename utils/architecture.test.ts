/**
 * ARCHITECTURE INTEGRATION TESTS
 * 
 * Verifies the NeuroNote architecture is correctly wired:
 * 1. Manifest derives from operators (single source of truth)
 * 2. Prompt builder includes all primitives
 * 3. Component registry covers all UI types
 * 4. All registries are in sync
 */

import { describe, it, expect } from 'vitest';
import { OPERATOR_REGISTRY } from '../operators/registry';
import { generateManifestForPrompt, getAllValidOperatorIds, generateCapabilityManifest } from '../manifest/registry';
import { buildCapabilityPrompt, buildUserPrompt } from '../services/ai/promptBuilder';
import { COMPONENT_REGISTRY, getComponentFactory, generateComponentDocsForPrompt } from '../runtime/ComponentRegistry';

// ============================================================================
// MANIFEST DERIVATION TESTS
// ============================================================================

describe('Manifest Derivation (Single Source of Truth)', () => {
  it('should derive all operators from OPERATOR_REGISTRY', () => {
    const manifest = generateCapabilityManifest();
    const manifestOpIds = new Set(manifest.dataflow.operators.map(op => op.id));
    const registryOpIds = new Set(Object.keys(OPERATOR_REGISTRY));
    
    // Every operator in registry should appear in manifest
    for (const opId of registryOpIds) {
      expect(manifestOpIds.has(opId)).toBe(true);
    }
    
    // Counts should match
    expect(manifestOpIds.size).toBe(registryOpIds.size);
  });

  it('should have 46 operators in the registry', () => {
    expect(Object.keys(OPERATOR_REGISTRY).length).toBe(46);
  });

  it('should preserve operator metadata in manifest', () => {
    const manifest = generateCapabilityManifest();
    
    // Check a specific operator
    const textUpper = manifest.dataflow.operators.find(op => op.id === 'Text.ToUpper');
    expect(textUpper).toBeDefined();
    expect(textUpper?.category).toBe('Text');
    expect(textUpper?.inputs.length).toBe(1);
    expect(textUpper?.inputs[0].name).toBe('text');
    expect(textUpper?.inputs[0].type).toBe('string');
    expect(textUpper?.output).toBe('string');
    expect(textUpper?.isHeavy).toBe(false); // Tier 1
  });

  it('should mark Tier 2 operators as heavy', () => {
    const manifest = generateCapabilityManifest();
    
    const imageOp = manifest.dataflow.operators.find(op => op.id === 'Image.Grayscale');
    expect(imageOp?.isHeavy).toBe(true);
    
    const textOp = manifest.dataflow.operators.find(op => op.id === 'Text.ToUpper');
    expect(textOp?.isHeavy).toBe(false);
  });

  it('should include all categories in manifest', () => {
    const manifest = generateCapabilityManifest();
    const categories = new Set(manifest.dataflow.operators.map(op => op.category));
    
    // Expected categories from operators
    expect(categories.has('Text')).toBe(true);
    expect(categories.has('Math')).toBe(true);
    expect(categories.has('List')).toBe(true);
    expect(categories.has('Image')).toBe(true);
    expect(categories.has('Audio')).toBe(true);
    expect(categories.has('Sanitizer')).toBe(true);
    expect(categories.has('CV')).toBe(true);
    expect(categories.has('Vector')).toBe(true);
    expect(categories.has('Debug')).toBe(true);
  });
});

// ============================================================================
// PROMPT BUILDER TESTS
// ============================================================================

describe('Prompt Builder', () => {
  it('should generate non-empty capability prompt', () => {
    const prompt = buildCapabilityPrompt();
    expect(prompt.length).toBeGreaterThan(1000);
  });

  it('should include Layer 1 I/O section', () => {
    const prompt = buildCapabilityPrompt();
    expect(prompt).toContain('LAYER 1');
    expect(prompt).toContain('Input.Image');
    expect(prompt).toContain('Output.Canvas');
  });

  it('should include Layer 2 operators section', () => {
    const prompt = buildCapabilityPrompt();
    expect(prompt).toContain('LAYER 2');
    expect(prompt).toContain('Text.ToUpper');
    expect(prompt).toContain('Image.Grayscale');
    expect(prompt).toContain('List.Append');
  });

  it('should include Layer 3 control section', () => {
    const prompt = buildCapabilityPrompt();
    expect(prompt).toContain('LAYER 3');
    expect(prompt).toContain('SET:');
    expect(prompt).toContain('RUN:');
    expect(prompt).toContain('RESET:');
  });

  it('should include all 46 operators in prompt', () => {
    const prompt = buildCapabilityPrompt();
    
    for (const opId of Object.keys(OPERATOR_REGISTRY)) {
      expect(prompt).toContain(opId);
    }
  });

  it('should include verification vectors section', () => {
    const prompt = buildCapabilityPrompt();
    expect(prompt).toContain('verificationVectors');
  });

  it('should build user prompt with current definition', () => {
    const mockDef = { version: 'test', initialContext: {}, machine: {}, view: {}, pipelines: {} };
    const userPrompt = buildUserPrompt(mockDef, 'create a task list', null);
    
    expect(userPrompt).toContain('create a task list');
    expect(userPrompt).toContain('CURRENT_DEFINITION');
    expect(userPrompt).toContain('"version": "test"');
  });

  it('should include validation feedback when provided', () => {
    const mockDef = { version: 'test' };
    const feedback = {
      version: 'v1',
      error: 'Missing required field',
      failures: ['initialContext is required']
    };
    
    const userPrompt = buildUserPrompt(mockDef, 'fix it', feedback);
    
    expect(userPrompt).toContain('VALIDATION_ERROR');
    expect(userPrompt).toContain('Missing required field');
    expect(userPrompt).toContain('initialContext is required');
  });
});

// ============================================================================
// MANIFEST PROMPT GENERATION
// ============================================================================

describe('Manifest Prompt Generation', () => {
  it('should generate compact manifest for AI', () => {
    const manifestPrompt = generateManifestForPrompt();
    
    expect(manifestPrompt).toContain('CAPABILITY MANIFEST');
    expect(manifestPrompt).toContain('LAYER 1');
    expect(manifestPrompt).toContain('LAYER 2');
    expect(manifestPrompt).toContain('LAYER 3');
  });

  it('should include input/output primitives', () => {
    const manifestPrompt = generateManifestForPrompt();
    
    expect(manifestPrompt).toContain('Input.Image');
    expect(manifestPrompt).toContain('Input.Slider');
    expect(manifestPrompt).toContain('Output.Canvas');
    expect(manifestPrompt).toContain('Output.Chart');
  });

  it('should include state machine capabilities', () => {
    const manifestPrompt = generateManifestForPrompt();
    
    expect(manifestPrompt).toContain('SET:');
    expect(manifestPrompt).toContain('ASSIGN:');
    expect(manifestPrompt).toContain('APPEND:');
    expect(manifestPrompt).toContain('RESET:');
    expect(manifestPrompt).toContain('TOGGLE:');
    expect(manifestPrompt).toContain('RUN:');
  });
});

// ============================================================================
// VALID OPERATOR ID REGISTRY
// ============================================================================

describe('Valid Operator ID Registry', () => {
  it('should return all valid IDs', () => {
    const validIds = getAllValidOperatorIds();
    
    // Should include Layer 1, 2, 3 primitives
    expect(validIds.has('Input.Image')).toBe(true);
    expect(validIds.has('Output.Canvas')).toBe(true);
    expect(validIds.has('Text.ToUpper')).toBe(true);
    expect(validIds.has('Control.Branch')).toBe(true);
    expect(validIds.has('SET')).toBe(true);
    expect(validIds.has('RUN')).toBe(true);
  });

  it('should have at least 60 valid IDs', () => {
    const validIds = getAllValidOperatorIds();
    // 11 inputs + 7 outputs + 46 operators + 5 flow + 8 capabilities = 77
    expect(validIds.size).toBeGreaterThanOrEqual(60);
  });
});

// ============================================================================
// COMPONENT REGISTRY TESTS
// ============================================================================

describe('Component Registry', () => {
  it('should have factories for core UI types', () => {
    expect(getComponentFactory('container')).toBeDefined();
    expect(getComponentFactory('text')).toBeDefined();
    expect(getComponentFactory('button')).toBeDefined();
    expect(getComponentFactory('input')).toBeDefined();
    expect(getComponentFactory('slider')).toBeDefined();
    expect(getComponentFactory('canvas')).toBeDefined();
  });

  it('should have factories for new component types', () => {
    expect(getComponentFactory('Layout.Stack')).toBeDefined();
    expect(getComponentFactory('Display.Text')).toBeDefined();
    expect(getComponentFactory('Control.Button')).toBeDefined();
    expect(getComponentFactory('Input.Slider')).toBeDefined();
  });

  it('should return null for unknown types', () => {
    expect(getComponentFactory('Unknown.Type')).toBeNull();
    expect(getComponentFactory('NonExistent')).toBeNull();
  });

  it('should have documentation generator', () => {
    const docs = generateComponentDocsForPrompt();
    
    expect(docs).toContain('Layout');
    expect(docs).toContain('Display');
    expect(docs).toContain('Control');
    expect(docs).toContain('Input');
  });
});

// ============================================================================
// REGISTRY SYNC TESTS
// ============================================================================

describe('Registry Synchronization', () => {
  it('should have matching operator counts in manifest and registry', () => {
    const manifest = generateCapabilityManifest();
    const registryCount = Object.keys(OPERATOR_REGISTRY).length;
    const manifestCount = manifest.dataflow.operators.length;
    
    expect(manifestCount).toBe(registryCount);
  });

  it('should have all operator IDs match between registries', () => {
    const manifest = generateCapabilityManifest();
    const registryIds = Object.keys(OPERATOR_REGISTRY).sort();
    const manifestIds = manifest.dataflow.operators.map(op => op.id).sort();
    
    expect(manifestIds).toEqual(registryIds);
  });

  it('should preserve complexity levels', () => {
    const manifest = generateCapabilityManifest();
    
    for (const op of manifest.dataflow.operators) {
      const registryOp = OPERATOR_REGISTRY[op.id];
      expect(registryOp).toBeDefined();
      expect(op.complexity).toBe(registryOp.properties.complexity);
    }
  });
});
