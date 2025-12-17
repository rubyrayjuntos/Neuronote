/**
 * OPERATOR IMPLEMENTATIONS
 * 
 * Pure implementations of all dataflow operators.
 * Extracted for testability - these are the same functions used in the Worker.
 * 
 * Each operator is a pure function: (inputs: unknown[]) => unknown
 * 
 * ROBUSTNESS REQUIREMENT: Operators must NEVER throw.
 * Any input (including hostile objects) must produce a valid output.
 */

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

// ============================================================================
// TEXT OPERATORS
// ============================================================================

export const TextOperators = {
  ToUpper: (inputs: unknown[]): string => 
    safeString(inputs[0]).toUpperCase(),
  
  Length: (inputs: unknown[]): number => 
    safeString(inputs[0]).length,
  
  RegexMatch: (inputs: unknown[]): string => {
    const str = safeString(inputs[0]);
    const pattern = safeString(inputs[1]);
    try {
      const match = str.match(new RegExp(pattern));
      return match ? match[0] : '';
    } catch {
      return '';  // Invalid regex returns empty
    }
  },
  
  Join: (inputs: unknown[]): string => {
    const arr = Array.isArray(inputs[0]) ? inputs[0] : [inputs[0]];
    const sep = safeString(inputs[1] ?? ', ');
    return arr.map(x => safeString(x)).join(sep);
  },
};

// ============================================================================
// MATH OPERATORS
// ============================================================================

export const MathOperators = {
  Add: (inputs: unknown[]): number => 
    safeNumber(inputs[0]) + safeNumber(inputs[1]),
  
  Subtract: (inputs: unknown[]): number => 
    safeNumber(inputs[0]) - safeNumber(inputs[1]),
  
  Multiply: (inputs: unknown[]): number => 
    safeNumber(inputs[0]) * safeNumber(inputs[1]),
  
  Divide: (inputs: unknown[]): number => {
    const a = safeNumber(inputs[0]);
    const b = safeNumber(inputs[1]);
    if (b === 0) {
      // Proper IEEE 754 behavior
      if (a === 0) return NaN;
      return a > 0 ? Infinity : -Infinity;
    }
    return a / b;
  },
  
  Threshold: (inputs: unknown[]): number => 
    safeNumber(inputs[0]) > safeNumber(inputs[1]) ? 1 : 0,
};

// ============================================================================
// LOGIC OPERATORS
// ============================================================================

export const LogicOperators = {
  If: (inputs: unknown[]): unknown => 
    inputs[0] ? inputs[1] : inputs[2],
  
  JsonPath: (inputs: unknown[]): unknown => {
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
// LIST OPERATORS
// ============================================================================

export const ListOperators = {
  Map: (inputs: unknown[]): unknown[] => {
    const arr = Array.isArray(inputs[0]) ? inputs[0] : [];
    // Currently just stringifies - could take a mapper function in extended version
    return arr.map(x => safeString(x));
  },
  
  Filter: (inputs: unknown[]): unknown[] => {
    const arr = Array.isArray(inputs[0]) ? inputs[0] : [];
    // Currently filters truthy - could take predicate in extended version
    return arr.filter(x => !!x);
  },
  
  Sort: (inputs: unknown[]): unknown[] => {
    const arr = Array.isArray(inputs[0]) ? [...inputs[0]] : [];
    // Safe sort that handles objects that can't be compared
    try {
      return arr.sort((a, b) => {
        // Attempt string comparison for safety
        const strA = typeof a === 'string' ? a : typeof a === 'number' ? String(a) : '';
        const strB = typeof b === 'string' ? b : typeof b === 'number' ? String(b) : '';
        return strA.localeCompare(strB);
      });
    } catch {
      return arr; // Return unsorted on comparison error
    }
  },
  
  Take: (inputs: unknown[]): unknown[] => {
    const arr = Array.isArray(inputs[0]) ? inputs[0] : [];
    const n = Math.max(0, Math.floor(safeNumber(inputs[1])));
    return arr.slice(0, n);
  },

  /**
   * Reduce a list to a single value using a built-in operation.
   * Supports: 'sum', 'product', 'concat', 'min', 'max', 'count'
   */
  Reduce: (inputs: unknown[]): unknown => {
    const arr = Array.isArray(inputs[0]) ? inputs[0] : [];
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
        return initial;  // Unknown operation returns initial
    }
  },

  /**
   * Bounded iteration: FoldN(n, init, step) = init + step * n
   * 
   * This is the safe loop primitive. It applies a fixed number of iterations.
   * For numeric accumulation: result = init + step * n
   * For array building: creates array of length n with values [init, init+step, init+2*step, ...]
   * 
   * GOVERNANCE: n is capped at MAX_FOLD_ITERATIONS (1000) to prevent resource exhaustion.
   */
  FoldN: (inputs: unknown[]): unknown => {
    const MAX_FOLD_ITERATIONS = 1000;  // Hard cap for safety
    
    const n = Math.min(MAX_FOLD_ITERATIONS, Math.max(0, Math.floor(safeNumber(inputs[0]))));
    const initial = safeNumber(inputs[1]);
    const step = safeNumber(inputs[2]);

    // If step is 0, just return initial (multiplication shortcut)
    if (step === 0) return initial;

    // For large n, use math instead of loop
    if (n > 100) {
      return initial + (step * n);
    }

    // For small n, build an array (useful for generating sequences)
    let acc = initial;
    for (let i = 0; i < n; i++) {
      acc += step;
    }
    return acc;
  },
};

// ============================================================================
// OPERATOR REGISTRY (for lookup)
// ============================================================================

export type OperatorFn = (inputs: unknown[]) => unknown;

export const OPERATORS: Record<string, OperatorFn> = {
  'Text.ToUpper': TextOperators.ToUpper,
  'Text.Length': TextOperators.Length,
  'Text.RegexMatch': TextOperators.RegexMatch,
  'Text.Join': TextOperators.Join,
  
  'Math.Add': MathOperators.Add,
  'Math.Subtract': MathOperators.Subtract,
  'Math.Multiply': MathOperators.Multiply,
  'Math.Divide': MathOperators.Divide,
  'Math.Threshold': MathOperators.Threshold,
  
  'Logic.If': LogicOperators.If,
  'Utility.JsonPath': LogicOperators.JsonPath,
  
  'List.Map': ListOperators.Map,
  'List.Filter': ListOperators.Filter,
  'List.Sort': ListOperators.Sort,
  'List.Take': ListOperators.Take,
  'List.Reduce': ListOperators.Reduce,
  'List.FoldN': ListOperators.FoldN,
};

// Note: Image and Audio operators are async and require browser APIs
// They are tested separately with integration tests
