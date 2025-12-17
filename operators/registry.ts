/**
 * OPERATOR REGISTRY - The Single Source of Truth
 * 
 * This module contains all operator definitions for the NeuroNote system.
 * Everything derives from this:
 * - Validator uses the schemas
 * - AI prompt is generated from descriptions
 * - Worker uses the implementations
 * - Tests are generated from properties
 * 
 * To add a new primitive:
 * 1. Define it here with full OperatorDefinition
 * 2. Run tests to verify properties hold
 * 3. The AI automatically learns about it (prompt is generated)
 */

import { OperatorDefinition, OperatorImpl } from './types';

// ============================================================================
// HELPER FUNCTIONS (Defensive wrappers for hostile inputs)
// ============================================================================

/**
 * Safe string coercion that handles objects with broken toString.
 */
function safeString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'symbol') return val.toString();
  if (typeof val === 'bigint') return val.toString();
  try {
    return String(val);
  } catch {
    return '[Object]';
  }
}

/**
 * Safe number coercion that handles hostile inputs.
 */
function safeNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val === null || val === undefined) return 0;
  try {
    const n = Number(val);
    return Number.isNaN(n) ? 0 : n;
  } catch {
    return 0;
  }
}

/**
 * Safe array coercion.
 */
function safeArray(val: unknown): unknown[] {
  return Array.isArray(val) ? val : [];
}

// ============================================================================
// TEXT OPERATORS (Tier 1 - Pure, Sync)
// ============================================================================

const TextToUpper: OperatorDefinition = {
  op: 'Text.ToUpper',
  category: 'Text',
  inputs: [{ name: 'text', type: 'string' }],
  output: 'string',
  description: 'Converts text to uppercase',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    idempotent: true,      // ToUpper(ToUpper(x)) === ToUpper(x)
    bounded: true,
    deterministic: true,
  },
  impl: (inputs) => safeString(inputs[0]).toUpperCase(),
};

const TextLength: OperatorDefinition = {
  op: 'Text.Length',
  category: 'Text',
  inputs: [{ name: 'text', type: 'string' }],
  output: 'number',
  description: 'Returns the length of text',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    bounded: true,
    deterministic: true,
  },
  impl: (inputs) => safeString(inputs[0]).length,
};

const TextRegexMatch: OperatorDefinition = {
  op: 'Text.RegexMatch',
  category: 'Text',
  inputs: [
    { name: 'text', type: 'string' },
    { name: 'pattern', type: 'string' },
  ],
  output: 'string',
  description: 'Extracts first regex match from text',
  example: "Text.RegexMatch('hello123', '\\d+') → '123'",
  tier: 1,
  pure: true,
  async: false,
  properties: {
    bounded: true,
    deterministic: true,
  },
  impl: (inputs) => {
    const str = safeString(inputs[0]);
    const pattern = safeString(inputs[1]);
    try {
      const match = str.match(new RegExp(pattern));
      return match ? match[0] : '';
    } catch {
      return '';  // Invalid regex returns empty
    }
  },
};

const TextJoin: OperatorDefinition = {
  op: 'Text.Join',
  category: 'Text',
  inputs: [
    { name: 'list', type: 'array' },
    { name: 'separator', type: 'string' },
  ],
  output: 'string',
  description: 'Joins array elements into text with separator',
  example: "Text.Join(['a', 'b', 'c'], '-') → 'a-b-c'",
  tier: 1,
  pure: true,
  async: false,
  properties: {
    bounded: true,
    deterministic: true,
  },
  impl: (inputs) => {
    const arr = safeArray(inputs[0]);
    const sep = safeString(inputs[1] ?? ', ');
    return arr.map(x => safeString(x)).join(sep);
  },
};

// ============================================================================
// MATH OPERATORS (Tier 1 - Pure, Sync)
// ============================================================================

const MathAdd: OperatorDefinition = {
  op: 'Math.Add',
  category: 'Math',
  inputs: [
    { name: 'a', type: 'number' },
    { name: 'b', type: 'number' },
  ],
  output: 'number',
  description: 'Adds two numbers',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    commutative: true,     // a + b === b + a
    associative: true,     // (a + b) + c === a + (b + c)
    bounded: true,
    deterministic: true,
  },
  impl: (inputs) => safeNumber(inputs[0]) + safeNumber(inputs[1]),
};

const MathSubtract: OperatorDefinition = {
  op: 'Math.Subtract',
  category: 'Math',
  inputs: [
    { name: 'a', type: 'number' },
    { name: 'b', type: 'number' },
  ],
  output: 'number',
  description: 'Subtracts b from a',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    bounded: true,
    deterministic: true,
  },
  impl: (inputs) => safeNumber(inputs[0]) - safeNumber(inputs[1]),
};

const MathMultiply: OperatorDefinition = {
  op: 'Math.Multiply',
  category: 'Math',
  inputs: [
    { name: 'a', type: 'number' },
    { name: 'b', type: 'number' },
  ],
  output: 'number',
  description: 'Multiplies two numbers',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    commutative: true,
    associative: true,
    bounded: true,
    deterministic: true,
  },
  impl: (inputs) => safeNumber(inputs[0]) * safeNumber(inputs[1]),
};

const MathDivide: OperatorDefinition = {
  op: 'Math.Divide',
  category: 'Math',
  inputs: [
    { name: 'a', type: 'number' },
    { name: 'b', type: 'number' },
  ],
  output: 'number',
  description: 'Divides a by b (returns Infinity for division by zero)',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    bounded: true,
    deterministic: true,
  },
  impl: (inputs) => {
    const a = safeNumber(inputs[0]);
    const b = safeNumber(inputs[1]);
    if (b === 0) {
      if (a === 0) return NaN;
      return a > 0 ? Infinity : -Infinity;
    }
    return a / b;
  },
};

const MathThreshold: OperatorDefinition = {
  op: 'Math.Threshold',
  category: 'Math',
  inputs: [
    { name: 'value', type: 'number' },
    { name: 'threshold', type: 'number' },
  ],
  output: 'number',
  description: 'Returns 1 if value > threshold, else 0',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    idempotent: true,      // Threshold(Threshold(x)) still returns 0 or 1
    bounded: true,
    deterministic: true,
  },
  impl: (inputs) => safeNumber(inputs[0]) > safeNumber(inputs[1]) ? 1 : 0,
};

// ============================================================================
// LOGIC OPERATORS (Tier 1 - Pure, Sync)
// ============================================================================

const LogicIf: OperatorDefinition = {
  op: 'Logic.If',
  category: 'Logic',
  inputs: [
    { name: 'condition', type: 'boolean' },
    { name: 'trueValue', type: 'any' },
    { name: 'falseValue', type: 'any' },
  ],
  output: 'any',
  description: 'Returns trueValue if condition is truthy, else falseValue',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    bounded: true,
    deterministic: true,
  },
  impl: (inputs) => inputs[0] ? inputs[1] : inputs[2],
};

const UtilityJsonPath: OperatorDefinition = {
  op: 'Utility.JsonPath',
  category: 'Utility',
  inputs: [
    { name: 'json', type: 'json' },
    { name: 'path', type: 'string' },
  ],
  output: 'any',
  description: 'Extracts value from JSON using dot notation path',
  example: "JsonPath({a: {b: 1}}, 'a.b') → 1",
  tier: 1,
  pure: true,
  async: false,
  properties: {
    bounded: true,
    deterministic: true,
  },
  impl: (inputs) => {
    const obj = inputs[0] as Record<string, unknown> | null;
    const path = safeString(inputs[1]);
    if (!obj || typeof obj !== 'object') return undefined;
    return path.split('.').reduce<unknown>(
      (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
      obj
    );
  },
};

// ============================================================================
// LIST OPERATORS (Tier 1 - Pure, Sync)
// ============================================================================

const ListMap: OperatorDefinition = {
  op: 'List.Map',
  category: 'List',
  inputs: [{ name: 'list', type: 'array' }],
  output: 'array',
  description: 'Maps array elements to strings',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    bounded: true,
    deterministic: true,
  },
  impl: (inputs) => safeArray(inputs[0]).map(x => safeString(x)),
};

const ListFilter: OperatorDefinition = {
  op: 'List.Filter',
  category: 'List',
  inputs: [{ name: 'list', type: 'array' }],
  output: 'array',
  description: 'Filters array to only truthy elements',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    idempotent: true,      // Filter(Filter(x)) === Filter(x)
    bounded: true,
    deterministic: true,
  },
  impl: (inputs) => safeArray(inputs[0]).filter(x => !!x),
};

const ListSort: OperatorDefinition = {
  op: 'List.Sort',
  category: 'List',
  inputs: [{ name: 'list', type: 'array' }],
  output: 'array',
  description: 'Sorts array elements',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    idempotent: true,      // Sort(Sort(x)) === Sort(x)
    bounded: true,
    deterministic: true,
  },
  impl: (inputs) => [...safeArray(inputs[0])].sort(),
};

const ListTake: OperatorDefinition = {
  op: 'List.Take',
  category: 'List',
  inputs: [
    { name: 'list', type: 'array' },
    { name: 'count', type: 'number' },
  ],
  output: 'array',
  description: 'Takes first n elements from array',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    bounded: true,
    deterministic: true,
  },
  impl: (inputs) => {
    const arr = safeArray(inputs[0]);
    const n = Math.max(0, Math.floor(safeNumber(inputs[1])));
    return arr.slice(0, n);
  },
};

const ListReduce: OperatorDefinition = {
  op: 'List.Reduce',
  category: 'List',
  inputs: [
    { name: 'list', type: 'array' },
    { name: 'initial', type: 'any' },
    { name: 'operation', type: 'string', description: 'sum|product|concat|min|max|count' },
  ],
  output: 'any',
  description: 'Reduces array to single value using named operation (sum, product, concat, min, max, count)',
  example: "List.Reduce([1,2,3], 0, 'sum') → 6",
  tier: 1,
  pure: true,
  async: false,
  properties: {
    bounded: true,
    deterministic: true,
  },
  impl: (inputs) => {
    const arr = safeArray(inputs[0]);
    const initial = inputs[1];
    const operation = safeString(inputs[2]).toLowerCase();

    switch (operation) {
      case 'sum':
        return arr.reduce((acc, x) => safeNumber(acc) + safeNumber(x), safeNumber(initial));
      case 'product':
        return arr.reduce((acc, x) => safeNumber(acc) * safeNumber(x), safeNumber(initial) || 1);
      case 'concat':
        return arr.reduce((acc, x) => safeString(acc) + safeString(x), safeString(initial));
      case 'min':
        return arr.reduce((acc, x) => Math.min(safeNumber(acc), safeNumber(x)), safeNumber(initial) || Infinity);
      case 'max':
        return arr.reduce((acc, x) => Math.max(safeNumber(acc), safeNumber(x)), safeNumber(initial) || -Infinity);
      case 'count':
        return arr.length;
      default:
        return initial;
    }
  },
};

const ListFoldN: OperatorDefinition = {
  op: 'List.FoldN',
  category: 'List',
  inputs: [
    { name: 'n', type: 'number', description: 'Number of iterations (capped at 1000)' },
    { name: 'initial', type: 'number' },
    { name: 'step', type: 'number' },
  ],
  output: 'number',
  description: 'Bounded iteration: returns initial + (step × n). Max 1000 iterations.',
  example: "List.FoldN(5, 0, 2) → 10",
  tier: 1,
  pure: true,
  async: false,
  properties: {
    bounded: true,         // Hard cap at 1000
    deterministic: true,
  },
  impl: (inputs) => {
    const MAX_FOLD_ITERATIONS = 1000;
    const n = Math.min(MAX_FOLD_ITERATIONS, Math.max(0, Math.floor(safeNumber(inputs[0]))));
    const initial = safeNumber(inputs[1]);
    const step = safeNumber(inputs[2]);

    if (step === 0) return initial;
    return initial + (step * n);
  },
};

// ============================================================================
// IMAGE OPERATORS (Tier 2 - Metered, Async)
// Note: Implementations reference processImage which is defined in WasmKernel
// ============================================================================

// Placeholder for async image processing - actual impl injected at runtime
const createImageOp = (
  name: string,
  description: string,
  effect: string
): OperatorDefinition => ({
  op: `Image.${name}`,
  category: 'Image',
  inputs: [{ name: 'image', type: 'image', description: 'DataURL of image' }],
  output: 'image',
  description,
  tier: 2,
  pure: true,
  async: true,
  properties: {
    idempotent: true,      // Grayscale(Grayscale(x)) === Grayscale(x)
    bounded: true,
    deterministic: true,
  },
  // Placeholder - actual canvas implementation in WasmKernel
  impl: async () => { throw new Error(`Image.${name} requires browser context`); },
});

const ImageGrayscale = createImageOp('Grayscale', 'Converts image to grayscale', 'grayscale');
const ImageInvert = createImageOp('Invert', 'Inverts image colors', 'invert');
const ImageEdgeDetect = createImageOp('EdgeDetect', 'Performs edge detection on image', 'edge');
const ImageResize = createImageOp('Resize', 'Resizes image to fit bounds', 'resize');
const ImageThreshold = createImageOp('Threshold', 'Converts image to black/white based on brightness threshold', 'threshold');

// ============================================================================
// AUDIO OPERATORS (Tier 2 - Metered, Async)
// ============================================================================

const AudioFFT: OperatorDefinition = {
  op: 'Audio.FFT',
  category: 'Audio',
  inputs: [{ name: 'audio', type: 'audio', description: 'DataURL of audio' }],
  output: 'array',
  description: 'Performs FFT on audio, returns frequency spectrum array',
  tier: 2,
  pure: true,
  async: true,
  properties: {
    bounded: true,
    deterministic: true,
  },
  // Placeholder - actual Web Audio implementation in WasmKernel
  impl: async () => { throw new Error('Audio.FFT requires browser context'); },
};

const AudioPeakDetect: OperatorDefinition = {
  op: 'Audio.PeakDetect',
  category: 'Audio',
  inputs: [{ name: 'audio', type: 'audio', description: 'DataURL of audio' }],
  output: 'boolean',
  description: 'Detects if audio has peak volume (>50% amplitude)',
  tier: 2,
  pure: true,
  async: true,
  properties: {
    bounded: true,
    deterministic: true,
  },
  // Placeholder - actual Web Audio implementation in WasmKernel
  impl: async () => { throw new Error('Audio.PeakDetect requires browser context'); },
};

// ============================================================================
// THE REGISTRY - Single Source of Truth
// ============================================================================

export const OPERATOR_REGISTRY: Record<string, OperatorDefinition> = {
  // Text (4)
  'Text.ToUpper': TextToUpper,
  'Text.Length': TextLength,
  'Text.RegexMatch': TextRegexMatch,
  'Text.Join': TextJoin,
  
  // Math (5)
  'Math.Add': MathAdd,
  'Math.Subtract': MathSubtract,
  'Math.Multiply': MathMultiply,
  'Math.Divide': MathDivide,
  'Math.Threshold': MathThreshold,
  
  // Logic (2)
  'Logic.If': LogicIf,
  'Utility.JsonPath': UtilityJsonPath,
  
  // List (6)
  'List.Map': ListMap,
  'List.Filter': ListFilter,
  'List.Sort': ListSort,
  'List.Take': ListTake,
  'List.Reduce': ListReduce,
  'List.FoldN': ListFoldN,
  
  // Image (5) - Tier 2
  'Image.Grayscale': ImageGrayscale,
  'Image.Invert': ImageInvert,
  'Image.EdgeDetect': ImageEdgeDetect,
  'Image.Resize': ImageResize,
  'Image.Threshold': ImageThreshold,
  
  // Audio (2) - Tier 2
  'Audio.FFT': AudioFFT,
  'Audio.PeakDetect': AudioPeakDetect,
};

// Total: 24 operators
