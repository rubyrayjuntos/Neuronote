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

import { OperatorDefinition, OperatorImpl } from './types.ts';

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
  description: 'Converts text to uppercase. Requires clean input.',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 1,
    idempotent: true,
    bounded: true,
    deterministic: true,
    inputTaint: 0, // Sensitive sink
    outputTaint: 0,
  },
  impl: (inputs) => safeString(inputs[0]).toUpperCase(),
};

const TextToLower: OperatorDefinition = {
  op: 'Text.ToLower',
  category: 'Text',
  inputs: [{ name: 'text', type: 'string' }],
  output: 'string',
  description: 'Converts text to lowercase.',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 1,
    idempotent: true,
    bounded: true,
    deterministic: true,
    outputTaint: 0,
  },
  impl: (inputs) => safeString(inputs[0]).toLowerCase(),
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
    complexity: 1,
    bounded: true,
    deterministic: true,
    outputTaint: 0, // Length is a clean number
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
  description: 'Extracts first regex match from text. Output is tainted.',
  example: "Text.RegexMatch('hello123', '\\d+') → '123'",
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 5,
    bounded: true,
    deterministic: true,
    outputTaint: 2,
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
  description: 'Joins array elements into text with separator. Output is tainted.',
  example: "Text.Join(['a', 'b', 'c'], '-') → 'a-b-c'",
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 5,
    bounded: true,
    deterministic: true,
    outputTaint: 2, // Joining can combine tainted data
  },
  impl: (inputs) => {
    const arr = safeArray(inputs[0]);
    const sep = safeString(inputs[1] ?? ', ');
    return arr.map(x => safeString(x)).join(sep);
  },
};

const TextSplit: OperatorDefinition = {
  op: 'Text.Split',
  category: 'Text',
  inputs: [
    { name: 'text', type: 'string' },
    { name: 'delimiter', type: 'string' },
  ],
  output: 'array',
  description: 'Splits text by delimiter into array.',
  example: "Text.Split('a-b-c', '-') → ['a', 'b', 'c']",
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 1,
    bounded: true,
    deterministic: true,
    outputTaint: 2,
  },
  impl: (inputs) => {
    const text = safeString(inputs[0]);
    const delim = safeString(inputs[1]);
    return delim ? text.split(delim) : [text];
  },
};

const TextReplace: OperatorDefinition = {
  op: 'Text.Replace',
  category: 'Text',
  inputs: [
    { name: 'text', type: 'string' },
    { name: 'find', type: 'string' },
    { name: 'replace', type: 'string' },
  ],
  output: 'string',
  description: 'Replaces all occurrences of find with replace.',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 5,
    bounded: true,
    deterministic: true,
    outputTaint: 2,
  },
  impl: (inputs) => {
    const text = safeString(inputs[0]);
    const find = safeString(inputs[1]);
    const replace = safeString(inputs[2]);
    if (!find) return text;
    return text.split(find).join(replace);
  },
};

const TextTemplate: OperatorDefinition = {
  op: 'Text.Template',
  category: 'Text',
  inputs: [
    { name: 'template', type: 'string', description: 'Template with {{key}} placeholders' },
    { name: 'data', type: 'json' },
  ],
  output: 'string',
  description: 'Fills template placeholders with data values.',
  example: "Text.Template('Hello {{name}}', {name: 'World'}) → 'Hello World'",
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 5,
    bounded: true,
    deterministic: true,
    outputTaint: 2,
  },
  impl: (inputs) => {
    const template = safeString(inputs[0]);
    const data = inputs[1] as Record<string, unknown> | null;
    if (!data || typeof data !== 'object') return template;
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => safeString(data[key]));
  },
};

// ============================================================================
// SANITIZER OPERATORS (Tier 1 - Pure, Sync)
// ============================================================================

const SanitizerStripHTML: OperatorDefinition = {
  op: 'Sanitizer.StripHTML',
  category: 'Sanitizer',
  inputs: [{ name: 'text', type: 'string' }],
  output: 'string',
  description: 'Removes HTML tags from text to prevent XSS. Downgrades taint to 0.',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 5,
    idempotent: true,
    bounded: true,
    deterministic: true,
    inputTaint: 2, // Accepts anything
    outputTaint: 0, // Outputs clean
  },
  impl: (inputs) => safeString(inputs[0]).replace(/<[^>]*>?/gm, ''),
};

const SanitizerClamp: OperatorDefinition = {
  op: 'Sanitizer.Clamp',
  category: 'Sanitizer',
  inputs: [
    { name: 'value', type: 'number' },
    { name: 'min', type: 'number' },
    { name: 'max', type: 'number' },
  ],
  output: 'number',
  description: 'Clamps number to safe bounds. Downgrades taint level.',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 1,
    idempotent: true,
    bounded: true,
    deterministic: true,
    outputTaint: 0,
  },
  impl: (inputs) => Math.min(safeNumber(inputs[2]), Math.max(safeNumber(inputs[1]), safeNumber(inputs[0]))),
};

const SanitizerTruncate: OperatorDefinition = {
  op: 'Sanitizer.Truncate',
  category: 'Sanitizer',
  inputs: [
    { name: 'text', type: 'string' },
    { name: 'maxLength', type: 'number' },
  ],
  output: 'string',
  description: 'Truncates text to max length. Downgrades taint level.',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 1,
    idempotent: true,
    bounded: true,
    deterministic: true,
    outputTaint: 0,
  },
  impl: (inputs) => safeString(inputs[0]).slice(0, Math.max(0, safeNumber(inputs[1]))),
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
    complexity: 1,
    commutative: true,
    associative: true,
    bounded: true,
    deterministic: true,
    outputTaint: 0,
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
    complexity: 1,
    bounded: true,
    deterministic: true,
    outputTaint: 0,
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
    complexity: 1,
    commutative: true,
    associative: true,
    bounded: true,
    deterministic: true,
    outputTaint: 0,
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
    complexity: 1,
    bounded: true,
    deterministic: true,
    outputTaint: 0,
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
    complexity: 1,
    idempotent: true,
    bounded: true,
    deterministic: true,
    outputTaint: 0,
  },
  impl: (inputs) => safeNumber(inputs[0]) > safeNumber(inputs[1]) ? 1 : 0,
};

const MathClamp: OperatorDefinition = {
  op: 'Math.Clamp',
  category: 'Math',
  inputs: [
    { name: 'value', type: 'number' },
    { name: 'min', type: 'number' },
    { name: 'max', type: 'number' },
  ],
  output: 'number',
  description: 'Clamps value to be within min and max bounds.',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 1,
    idempotent: true,
    bounded: true,
    deterministic: true,
    outputTaint: 0,
  },
  impl: (inputs) => Math.min(safeNumber(inputs[2]), Math.max(safeNumber(inputs[1]), safeNumber(inputs[0]))),
};

const MathNormalize: OperatorDefinition = {
  op: 'Math.Normalize',
  category: 'Math',
  inputs: [
    { name: 'value', type: 'number' },
    { name: 'min', type: 'number' },
    { name: 'max', type: 'number' },
  ],
  output: 'number',
  description: 'Normalizes value to 0-1 range based on min/max.',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 1,
    bounded: true,
    deterministic: true,
    outputTaint: 0,
  },
  impl: (inputs) => {
    const val = safeNumber(inputs[0]);
    const min = safeNumber(inputs[1]);
    const max = safeNumber(inputs[2]);
    if (max === min) return 0;
    return (val - min) / (max - min);
  },
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
    complexity: 1,
    bounded: true,
    deterministic: true,
    outputTaint: 2, // Output taint depends on what is passed in
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
    complexity: 5,
    bounded: true,
    deterministic: true,
    outputTaint: 2, // Extracted value is of unknown taint
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
    complexity: 5,
    bounded: true,
    deterministic: true,
    outputTaint: 2,
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
    complexity: 5,
    idempotent: true,
    bounded: true,
    deterministic: true,
    outputTaint: 2,
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
    complexity: 5,
    idempotent: true,
    bounded: true,
    deterministic: true,
    outputTaint: 2,
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
    complexity: 5,
    bounded: true,
    deterministic: true,
    outputTaint: 2,
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
  description: 'Reduces array to single value using named operation',
  example: "List.Reduce([1,2,3], 0, 'sum') → 6",
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 5,
    bounded: true,
    deterministic: true,
    outputTaint: 2,
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
    complexity: 1,
    bounded: true,
    deterministic: true,
    outputTaint: 0,
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

const ListAppend: OperatorDefinition = {
  op: 'List.Append',
  category: 'List',
  inputs: [
    { name: 'list', type: 'array' },
    { name: 'item', type: 'any' },
  ],
  output: 'array',
  description: 'Appends an item to a list and returns the new list',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 1,
    bounded: true,
    deterministic: true,
    outputTaint: 2,
  },
  impl: (inputs) => {
    const arr = safeArray(inputs[0]);
    const item = inputs[1];
    return [...arr, item];
  },
};

const ListGroupBy: OperatorDefinition = {
  op: 'List.GroupBy',
  category: 'List',
  inputs: [
    { name: 'list', type: 'array' },
    { name: 'key', type: 'string' },
  ],
  output: 'json',
  description: 'Groups list elements by a key property.',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 5,
    bounded: true,
    deterministic: true,
    outputTaint: 2,
  },
  impl: (inputs) => {
    const arr = safeArray(inputs[0]);
    const key = safeString(inputs[1]);
    const result: Record<string, unknown[]> = {};
    for (const item of arr) {
      if (item && typeof item === 'object') {
        const groupKey = safeString((item as Record<string, unknown>)[key]);
        if (!result[groupKey]) result[groupKey] = [];
        result[groupKey].push(item);
      }
    }
    return result;
  },
};

const ListLength: OperatorDefinition = {
  op: 'List.Length',
  category: 'List',
  inputs: [{ name: 'list', type: 'array' }],
  output: 'number',
  description: 'Returns the length of the list.',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 1,
    bounded: true,
    deterministic: true,
    outputTaint: 0,
  },
  impl: (inputs) => safeArray(inputs[0]).length,
};

// ============================================================================
// IMAGE OPERATORS (Tier 2 - Metered, Async)
// ============================================================================

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
    complexity: 10,
    idempotent: true,
    bounded: true,
    deterministic: true,
    outputTaint: 1,
  },
  impl: async () => { throw new Error(`Image.${name} requires browser context`); },
});

const ImageGrayscale = createImageOp('Grayscale', 'Converts image to grayscale', 'grayscale');
const ImageInvert = createImageOp('Invert', 'Inverts image colors', 'invert');
const ImageEdgeDetect = createImageOp('EdgeDetect', 'Performs edge detection on image', 'edge');
const ImageResize = createImageOp('Resize', 'Resizes image to fit bounds', 'resize');
const ImageThreshold = createImageOp('Threshold', 'Converts image to black/white', 'threshold');
const ImageBlur = createImageOp('Blur', 'Applies Gaussian blur to image', 'blur');

const ImageDecode: OperatorDefinition = {
  op: 'Image.Decode',
  category: 'Image',
  inputs: [{ name: 'data', type: 'string', description: 'DataURL or base64 image data' }],
  output: 'image',
  description: 'Decodes image data into pixel buffer for processing.',
  tier: 2,
  pure: true,
  async: true,
  properties: {
    complexity: 5,
    bounded: true,
    deterministic: true,
    outputTaint: 1,
  },
  impl: async () => { throw new Error('Image.Decode requires browser context'); },
};

// ============================================================================
// COMPUTER VISION OPERATORS (Tier 2 - Heavy)
// ============================================================================

const CVContourTrace: OperatorDefinition = {
  op: 'CV.ContourTrace',
  category: 'CV',
  inputs: [{ name: 'image', type: 'image' }],
  output: 'array',
  description: 'Traces contours in binary image using marching squares. Returns array of path points.',
  example: 'CV.ContourTrace(binaryImage) → [[{x,y}, ...], ...]',
  tier: 2,
  pure: true,
  async: true,
  properties: {
    complexity: 10,
    bounded: true,
    deterministic: true,
    outputTaint: 1,
  },
  impl: async () => { throw new Error('CV.ContourTrace requires browser context'); },
};

const CVVectorize: OperatorDefinition = {
  op: 'CV.Vectorize',
  category: 'CV',
  inputs: [{ name: 'image', type: 'image' }],
  output: 'svg',
  description: 'Full vectorization: edge detect → contour trace → SVG paths.',
  tier: 2,
  pure: true,
  async: true,
  properties: {
    complexity: 10,
    bounded: true,
    deterministic: true,
    outputTaint: 1,
  },
  impl: async () => { throw new Error('CV.Vectorize requires browser context'); },
};

// ============================================================================
// VECTOR OPERATORS (Tier 1 - Light)
// ============================================================================

const VectorToSVG: OperatorDefinition = {
  op: 'Vector.ToSVG',
  category: 'Vector',
  inputs: [{ name: 'paths', type: 'array', description: 'Array of path point arrays' }],
  output: 'svg',
  description: 'Converts path point arrays to SVG string.',
  example: 'Vector.ToSVG([[{x:0,y:0}, {x:10,y:10}]]) → "<svg>..."',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 5,
    bounded: true,
    deterministic: true,
    outputTaint: 1,
  },
  impl: (inputs) => {
    const paths = safeArray(inputs[0]);
    const pathStrings = paths.map(path => {
      const points = safeArray(path);
      if (points.length === 0) return '';
      const first = points[0] as { x?: number; y?: number };
      let d = `M ${safeNumber(first?.x)} ${safeNumber(first?.y)}`;
      for (let i = 1; i < points.length; i++) {
        const pt = points[i] as { x?: number; y?: number };
        d += ` L ${safeNumber(pt?.x)} ${safeNumber(pt?.y)}`;
      }
      return `<path d="${d}" fill="none" stroke="black" />`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg">${pathStrings.join('')}</svg>`;
  },
};

const VectorSimplify: OperatorDefinition = {
  op: 'Vector.Simplify',
  category: 'Vector',
  inputs: [
    { name: 'paths', type: 'array' },
    { name: 'tolerance', type: 'number' },
  ],
  output: 'array',
  description: 'Reduces path complexity using Douglas-Peucker algorithm.',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 5,
    bounded: true,
    deterministic: true,
    outputTaint: 1,
  },
  impl: (inputs) => {
    // Simplified Douglas-Peucker implementation
    const paths = safeArray(inputs[0]);
    const tolerance = safeNumber(inputs[1]) || 1;
    
    function simplifyPath(points: unknown[]): unknown[] {
      if (points.length <= 2) return points;
      
      // Find furthest point from line between first and last
      const first = points[0] as { x?: number; y?: number };
      const last = points[points.length - 1] as { x?: number; y?: number };
      const x1 = safeNumber(first?.x), y1 = safeNumber(first?.y);
      const x2 = safeNumber(last?.x), y2 = safeNumber(last?.y);
      
      let maxDist = 0;
      let maxIdx = 0;
      
      for (let i = 1; i < points.length - 1; i++) {
        const pt = points[i] as { x?: number; y?: number };
        const px = safeNumber(pt?.x), py = safeNumber(pt?.y);
        
        // Perpendicular distance to line
        const num = Math.abs((y2-y1)*px - (x2-x1)*py + x2*y1 - y2*x1);
        const den = Math.sqrt((y2-y1)**2 + (x2-x1)**2) || 1;
        const dist = num / den;
        
        if (dist > maxDist) {
          maxDist = dist;
          maxIdx = i;
        }
      }
      
      if (maxDist > tolerance) {
        const left = simplifyPath(points.slice(0, maxIdx + 1));
        const right = simplifyPath(points.slice(maxIdx));
        return [...left.slice(0, -1), ...right];
      }
      
      return [first, last];
    }
    
    return paths.map(path => simplifyPath(safeArray(path)));
  },
};

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
    complexity: 10,
    bounded: true,
    deterministic: true,
    outputTaint: 1,
  },
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
    complexity: 10,
    bounded: true,
    deterministic: true,
    outputTaint: 0,
  },
  impl: async () => { throw new Error('Audio.PeakDetect requires browser context'); },
};

const AudioDecode: OperatorDefinition = {
  op: 'Audio.Decode',
  category: 'Audio',
  inputs: [{ name: 'data', type: 'string', description: 'DataURL of audio' }],
  output: 'audio',
  description: 'Decodes audio data into PCM buffer for processing.',
  tier: 2,
  pure: true,
  async: true,
  properties: {
    complexity: 10,
    bounded: true,
    deterministic: true,
    outputTaint: 1,
  },
  impl: async () => { throw new Error('Audio.Decode requires browser context'); },
};

const AudioBeatDetect: OperatorDefinition = {
  op: 'Audio.BeatDetect',
  category: 'Audio',
  inputs: [{ name: 'audio', type: 'audio' }],
  output: 'array',
  description: 'Detects beat timestamps in audio. Returns array of time markers.',
  tier: 2,
  pure: true,
  async: true,
  properties: {
    complexity: 10,
    bounded: true,
    deterministic: true,
    outputTaint: 1,
  },
  impl: async () => { throw new Error('Audio.BeatDetect requires browser context'); },
};

// ============================================================================
// DEBUG OPERATORS (Tier 1 - Light)
// ============================================================================

const DebugTraceInsert: OperatorDefinition = {
  op: 'Debug.TraceInsert',
  category: 'Debug',
  inputs: [
    { name: 'value', type: 'any' },
    { name: 'label', type: 'string' },
  ],
  output: 'any',
  description: 'Logs value with label for debugging, passes through unchanged.',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 1,
    bounded: true,
    deterministic: true,
    outputTaint: 2, // Passes through
  },
  impl: (inputs) => {
    const value = inputs[0];
    const label = safeString(inputs[1]);
    console.log(`[Debug.TraceInsert] ${label}:`, value);
    return value;
  },
};

const DebugDiffState: OperatorDefinition = {
  op: 'Debug.DiffState',
  category: 'Debug',
  inputs: [
    { name: 'before', type: 'json' },
    { name: 'after', type: 'json' },
  ],
  output: 'json',
  description: 'Returns the difference between two state objects.',
  tier: 1,
  pure: true,
  async: false,
  properties: {
    complexity: 5,
    bounded: true,
    deterministic: true,
    outputTaint: 0,
  },
  impl: (inputs) => {
    const before = inputs[0] as Record<string, unknown> | null;
    const after = inputs[1] as Record<string, unknown> | null;
    if (!before || !after || typeof before !== 'object' || typeof after !== 'object') {
      return {};
    }
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of allKeys) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        diff[key] = { before: before[key], after: after[key] };
      }
    }
    return diff;
  },
};

// ============================================================================
// THE REGISTRY - Single Source of Truth
// ============================================================================

export const OPERATOR_REGISTRY: Record<string, OperatorDefinition> = {
  // Text (8)
  'Text.ToUpper': TextToUpper,
  'Text.ToLower': TextToLower,
  'Text.Length': TextLength,
  'Text.RegexMatch': TextRegexMatch,
  'Text.Join': TextJoin,
  'Text.Split': TextSplit,
  'Text.Replace': TextReplace,
  'Text.Template': TextTemplate,
  
  // Sanitizer (3)
  'Sanitizer.StripHTML': SanitizerStripHTML,
  'Sanitizer.Clamp': SanitizerClamp,
  'Sanitizer.Truncate': SanitizerTruncate,

  // Math (7)
  'Math.Add': MathAdd,
  'Math.Subtract': MathSubtract,
  'Math.Multiply': MathMultiply,
  'Math.Divide': MathDivide,
  'Math.Threshold': MathThreshold,
  'Math.Clamp': MathClamp,
  'Math.Normalize': MathNormalize,
  
  // Logic (2)
  'Logic.If': LogicIf,
  'Utility.JsonPath': UtilityJsonPath,
  
  // List (9)
  'List.Map': ListMap,
  'List.Filter': ListFilter,
  'List.Sort': ListSort,
  'List.Take': ListTake,
  'List.Reduce': ListReduce,
  'List.FoldN': ListFoldN,
  'List.Append': ListAppend,
  'List.GroupBy': ListGroupBy,
  'List.Length': ListLength,
  
  // Image (7) - Tier 2
  'Image.Decode': ImageDecode,
  'Image.Grayscale': ImageGrayscale,
  'Image.Invert': ImageInvert,
  'Image.EdgeDetect': ImageEdgeDetect,
  'Image.Resize': ImageResize,
  'Image.Threshold': ImageThreshold,
  'Image.Blur': ImageBlur,
  
  // Computer Vision (2) - Tier 2
  'CV.ContourTrace': CVContourTrace,
  'CV.Vectorize': CVVectorize,
  
  // Vector (2) - Tier 1
  'Vector.ToSVG': VectorToSVG,
  'Vector.Simplify': VectorSimplify,
  
  // Audio (4) - Tier 2
  'Audio.Decode': AudioDecode,
  'Audio.FFT': AudioFFT,
  'Audio.PeakDetect': AudioPeakDetect,
  'Audio.BeatDetect': AudioBeatDetect,
  
  // Debug (2) - Tier 1
  'Debug.TraceInsert': DebugTraceInsert,
  'Debug.DiffState': DebugDiffState,
};

// Total: 46 operators
