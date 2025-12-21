/**
 * CAPABILITY MANIFEST REGISTRY
 * 
 * This module builds the complete Capability Manifest from the operator registry
 * and defines all three layers of primitives.
 * 
 * The AI Guest receives this manifest as its "palette" for creating tools.
 * 
 * SINGLE SOURCE OF TRUTH:
 * - Layer 2 (Dataflow Operators) is DERIVED from operators/registry.ts
 * - Layer 1 (I/O) and Layer 3 (Control) are defined here (no operator equivalents)
 * 
 * To add a new operator:
 * 1. Add it to operators/registry.ts with full OperatorDefinition
 * 2. It automatically appears in the manifest (no duplicate entry needed)
 */

import {
  CapabilityManifest,
  Layer1_EmbodiedIO,
  Layer2_DataflowOperators,
  Layer3_ControlState,
  InputPrimitive,
  OutputPrimitive,
  OperatorPrimitive,
  ControlPrimitive,
  CapabilityPrimitive,
} from './types';

// Import from operators registry - THE SINGLE SOURCE OF TRUTH
import { OPERATOR_REGISTRY } from '../operators/registry';

// ============================================================================
// LAYER 1: EMBODIED I/O PRIMITIVES
// ============================================================================

const INPUT_PRIMITIVES: InputPrimitive[] = [
  // File Inputs
  {
    id: 'Input.Image',
    name: 'Image Upload',
    description: 'File picker for raster images (PNG, JPG, WebP). Outputs image as DataURL.',
    outputType: 'image',
    config: { acceptTypes: ['image'] },
    emitsEvent: 'FILE_SELECTED',
  },
  {
    id: 'Input.Audio',
    name: 'Audio Upload',
    description: 'File picker for audio files (MP3, WAV, OGG). Outputs audio as DataURL.',
    outputType: 'audio',
    config: { acceptTypes: ['audio'] },
    emitsEvent: 'FILE_SELECTED',
  },
  {
    id: 'Input.Text',
    name: 'Text File Upload',
    description: 'File picker for text files (TXT, MD). Outputs content as string.',
    outputType: 'string',
    config: { acceptTypes: ['text'] },
    emitsEvent: 'FILE_SELECTED',
  },
  {
    id: 'Input.CSV',
    name: 'CSV Upload',
    description: 'File picker for CSV data. Outputs parsed rows as array of objects.',
    outputType: 'array',
    config: { acceptTypes: ['csv'] },
    emitsEvent: 'FILE_SELECTED',
  },
  {
    id: 'Input.JSON',
    name: 'JSON Upload',
    description: 'File picker for JSON files. Outputs parsed JSON object.',
    outputType: 'json',
    config: { acceptTypes: ['json'] },
    emitsEvent: 'FILE_SELECTED',
  },
  
  // Interactive Inputs
  {
    id: 'Input.Slider',
    name: 'Slider',
    description: 'Numeric slider with configurable min/max/step. Outputs number.',
    outputType: 'number',
    config: { range: { min: 0, max: 100, step: 1 } },
    emitsEvent: 'VALUE_CHANGED',
  },
  {
    id: 'Input.Toggle',
    name: 'Toggle Switch',
    description: 'Boolean toggle switch. Outputs true/false.',
    outputType: 'boolean',
    emitsEvent: 'VALUE_CHANGED',
  },
  {
    id: 'Input.TextField',
    name: 'Text Input',
    description: 'Single-line text input. Outputs string.',
    outputType: 'string',
    config: { validation: { maxLength: 1000 } },
    emitsEvent: 'VALUE_CHANGED',
  },
  {
    id: 'Input.TextArea',
    name: 'Text Area',
    description: 'Multi-line text input. Outputs string.',
    outputType: 'string',
    config: { validation: { maxLength: 10000 } },
    emitsEvent: 'VALUE_CHANGED',
  },
  {
    id: 'Input.Dropzone',
    name: 'Dropzone',
    description: 'Drag-and-drop area for files. Outputs file as DataURL.',
    outputType: 'string',
    emitsEvent: 'FILE_DROPPED',
  },
  {
    id: 'Input.ColorPicker',
    name: 'Color Picker',
    description: 'Color selection input. Outputs hex color string.',
    outputType: 'string',
    emitsEvent: 'VALUE_CHANGED',
  },
];

const OUTPUT_PRIMITIVES: OutputPrimitive[] = [
  // Visual Outputs
  {
    id: 'Output.Canvas',
    name: 'Canvas',
    description: 'Rendering surface for images. Supports raster (DataURL) or vector (SVG) modes.',
    inputType: 'image',
    config: { mode: 'raster' },
  },
  {
    id: 'Output.VectorCanvas',
    name: 'Vector Canvas',
    description: 'SVG rendering surface for vector graphics.',
    inputType: 'svg',
    config: { mode: 'vector' },
  },
  {
    id: 'Output.Chart',
    name: 'Chart',
    description: 'Data visualization chart. Accepts array of data points.',
    inputType: 'array',
    config: { chartType: 'line' },
  },
  {
    id: 'Output.Timeline',
    name: 'Timeline',
    description: 'Audio/video timeline visualization. Accepts waveform or event data.',
    inputType: 'array',
  },
  {
    id: 'Output.Text',
    name: 'Text Display',
    description: 'Text output display. Renders string content.',
    inputType: 'string',
  },
  
  // Notification Outputs
  {
    id: 'Output.Toast',
    name: 'Toast Notification',
    description: 'Temporary notification popup. Accepts message string.',
    inputType: 'string',
  },
  {
    id: 'Output.Progress',
    name: 'Progress Bar',
    description: 'Progress indicator. Accepts number 0-100.',
    inputType: 'number',
  },
];

const LAYER1: Layer1_EmbodiedIO = {
  inputs: INPUT_PRIMITIVES,
  outputs: OUTPUT_PRIMITIVES,
};

// ============================================================================
// LAYER 2: DATAFLOW OPERATORS (DERIVED FROM operators/registry.ts)
// ============================================================================

/**
 * AUTOMATION: Layer 2 operators are derived from the operators registry.
 * This eliminates duplication - operators/registry.ts is the single source of truth.
 * 
 * To add a new operator:
 * 1. Add it to operators/registry.ts with full OperatorDefinition
 * 2. It automatically appears in the manifest (no duplicate entry needed)
 */
const DATAFLOW_OPERATORS: OperatorPrimitive[] = Object.values(OPERATOR_REGISTRY).map(op => ({
  id: op.op,
  category: op.category,
  inputs: op.inputs.map(input => ({
    name: input.name,
    type: input.type,
    description: input.description,
  })),
  output: op.output,
  description: op.description,
  example: op.example,
  complexity: op.properties.complexity,
  isHeavy: op.tier === 2,
}));

const LAYER2: Layer2_DataflowOperators = {
  operators: DATAFLOW_OPERATORS,
};

// ============================================================================
// LAYER 3: CONTROL & STATE PRIMITIVES
// ============================================================================

const FLOW_CONTROL_PRIMITIVES: ControlPrimitive[] = [
  {
    id: 'Control.Branch',
    name: 'Branch',
    description: 'Conditional routing: outputs to trueOutput if condition is truthy, else falseOutput.',
    inputs: [
      { name: 'condition', type: 'boolean' },
      { name: 'trueValue', type: 'any' },
      { name: 'falseValue', type: 'any' },
    ],
    output: 'any',
  },
  {
    id: 'Control.Switch',
    name: 'Switch',
    description: 'Multi-way branch based on value matching.',
    inputs: [
      { name: 'value', type: 'any' },
      { name: 'cases', type: 'json', description: 'Map of value → output' },
      { name: 'default', type: 'any' },
    ],
    output: 'any',
  },
  {
    id: 'Control.Gate',
    name: 'Gate',
    description: 'Passes value through only if condition is truthy, otherwise outputs null.',
    inputs: [
      { name: 'value', type: 'any' },
      { name: 'condition', type: 'boolean' },
    ],
    output: 'any',
  },
  {
    id: 'Control.Throttle',
    name: 'Throttle',
    description: 'Rate-limits value updates. Only passes through at most once per interval.',
    inputs: [
      { name: 'value', type: 'any' },
      { name: 'intervalMs', type: 'number' },
    ],
    output: 'any',
  },
  {
    id: 'Control.Debounce',
    name: 'Debounce',
    description: 'Delays passing value until input stops changing for specified duration.',
    inputs: [
      { name: 'value', type: 'any' },
      { name: 'delayMs', type: 'number' },
    ],
    output: 'any',
  },
];

const CAPABILITY_PRIMITIVES: CapabilityPrimitive[] = [
  {
    id: 'SET',
    description: 'Assigns a literal value to a context key.',
    argPattern: 'key:value',
    example: 'SET:count:0 — Sets count to 0',
  },
  {
    id: 'ASSIGN',
    description: 'Assigns event payload to a context key.',
    argPattern: 'key',
    example: 'ASSIGN:selectedFile — Stores the event payload in selectedFile',
  },
  {
    id: 'APPEND',
    description: 'Appends value from one key to a list at another key.',
    argPattern: 'sourceKey:targetListKey',
    example: 'APPEND:newTask:tasks — Adds newTask value to tasks array',
  },
  {
    id: 'RESET',
    description: 'Clears a context key to empty string.',
    argPattern: 'key',
    example: 'RESET:inputField — Clears inputField to ""',
  },
  {
    id: 'TOGGLE',
    description: 'Inverts a boolean context value.',
    argPattern: 'key',
    example: 'TOGGLE:isOpen — Flips isOpen between true/false',
  },
  {
    id: 'RUN',
    description: 'Triggers a pipeline and stores result in target key.',
    argPattern: 'pipelineId:targetKey',
    example: 'RUN:processImage:processedImg — Runs processImage pipeline, stores in processedImg',
  },
  {
    id: 'SPAWN',
    description: 'Creates a new actor instance of a type and adds to a list.',
    argPattern: 'actorType:listKey',
    example: 'SPAWN:taskActor:tasks — Creates new taskActor, adds ID to tasks',
  },
  {
    id: 'DELETE',
    description: 'Deletes the current actor (only valid in actor scope).',
    argPattern: '',
    example: 'DELETE — Removes this actor from the system',
  },
];

const LAYER3: Layer3_ControlState = {
  flowControl: FLOW_CONTROL_PRIMITIVES,
  capabilities: CAPABILITY_PRIMITIVES,
};

// ============================================================================
// MANIFEST GENERATION
// ============================================================================

/**
 * Generate the complete Capability Manifest.
 * This is what gets sent to the AI Guest.
 */
export function generateCapabilityManifest(): CapabilityManifest {
  return {
    meta: {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
    },
    embodiedIO: LAYER1,
    dataflow: LAYER2,
    controlState: LAYER3,
  };
}

/**
 * Generate a compact manifest string for the AI system prompt.
 * Groups primitives by layer and category for easy reference.
 */
export function generateManifestForPrompt(): string {
  const lines: string[] = [
    '# CAPABILITY MANIFEST',
    'You can only wire primitives from this manifest. Any unlisted ID will be rejected.',
    '',
    '## LAYER 1: EMBODIED I/O (Interface Primitives)',
    '',
    '### Input Streams',
    'Each input emits a specific event when triggered. Use that event name in the state machine.',
    '',
  ];
  
  for (const input of INPUT_PRIMITIVES) {
    lines.push(`- ${input.id}: ${input.description} → outputs ${input.outputType}, emits "${input.emitsEvent}"`);
  }
  
  lines.push('', '### Output Sinks');
  for (const output of OUTPUT_PRIMITIVES) {
    lines.push(`- ${output.id}: ${output.description} ← accepts ${output.inputType}`);
  }
  
  lines.push('', '## LAYER 2: DATAFLOW OPERATORS (Logic Primitives)', '');
  
  // Group by category
  const byCategory = new Map<string, OperatorPrimitive[]>();
  for (const op of DATAFLOW_OPERATORS) {
    const list = byCategory.get(op.category) || [];
    list.push(op);
    byCategory.set(op.category, list);
  }
  
  for (const [category, ops] of byCategory) {
    const heavyNote = ops.some(o => o.isHeavy) ? ' (Heavy/Async)' : '';
    lines.push(`### ${category}${heavyNote}`);
    for (const op of ops) {
      const inputsStr = op.inputs.map(i => `${i.name}: ${i.type}`).join(', ');
      lines.push(`- ${op.id}(${inputsStr}) → ${op.output}: ${op.description}`);
    }
    lines.push('');
  }
  
  lines.push('## LAYER 3: CONTROL & STATE (Glue Primitives)', '');
  
  lines.push('### Flow Control');
  for (const ctrl of FLOW_CONTROL_PRIMITIVES) {
    const inputsStr = ctrl.inputs.map(i => `${i.name}: ${i.type}`).join(', ');
    lines.push(`- ${ctrl.id}(${inputsStr}) → ${ctrl.output}: ${ctrl.description}`);
  }
  
  lines.push('', '### State Machine Capabilities (Actions)');
  for (const cap of CAPABILITY_PRIMITIVES) {
    lines.push(`- ${cap.id}:${cap.argPattern} — ${cap.description}. Example: ${cap.example}`);
  }
  
  return lines.join('\n');
}

/**
 * Get all valid operator IDs for validation.
 */
export function getAllValidOperatorIds(): Set<string> {
  const ids = new Set<string>();
  
  // Layer 1
  INPUT_PRIMITIVES.forEach(p => ids.add(p.id));
  OUTPUT_PRIMITIVES.forEach(p => ids.add(p.id));
  
  // Layer 2
  DATAFLOW_OPERATORS.forEach(p => ids.add(p.id));
  
  // Layer 3
  FLOW_CONTROL_PRIMITIVES.forEach(p => ids.add(p.id));
  CAPABILITY_PRIMITIVES.forEach(p => ids.add(p.id));
  
  return ids;
}
