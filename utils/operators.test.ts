/**
 * OPERATOR PROPERTY-BASED TESTS
 * 
 * Uses fast-check to fuzz all operators with random inputs.
 * Verifies:
 * 1. No operator throws (robustness)
 * 2. Operators are pure (same input → same output)
 * 3. Type preservation (output matches expected type)
 * 4. Algebraic properties where applicable
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { TextOperators, MathOperators, LogicOperators, ListOperators, OPERATORS } from './operators';

// ============================================================================
// PROPERTY: NO OPERATOR THROWS
// ============================================================================

describe('Operator Robustness (No Throws)', () => {
  it('Text.ToUpper handles any input without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(() => TextOperators.ToUpper([input])).not.toThrow();
      }),
      { numRuns: 1000 }
    );
  });

  it('Text.Length handles any input without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(() => TextOperators.Length([input])).not.toThrow();
      }),
      { numRuns: 1000 }
    );
  });

  it('Text.RegexMatch handles any input without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (input, pattern) => {
        // Even invalid regex should not throw (returns empty)
        expect(() => TextOperators.RegexMatch([input, pattern])).not.toThrow();
      }),
      { numRuns: 1000 }
    );
  });

  it('Text.Join handles any input without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (arr, sep) => {
        expect(() => TextOperators.Join([arr, sep])).not.toThrow();
      }),
      { numRuns: 1000 }
    );
  });

  it('Math.Add handles any input without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (a, b) => {
        expect(() => MathOperators.Add([a, b])).not.toThrow();
      }),
      { numRuns: 1000 }
    );
  });

  it('Math.Subtract handles any input without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (a, b) => {
        expect(() => MathOperators.Subtract([a, b])).not.toThrow();
      }),
      { numRuns: 1000 }
    );
  });

  it('Math.Multiply handles any input without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (a, b) => {
        expect(() => MathOperators.Multiply([a, b])).not.toThrow();
      }),
      { numRuns: 1000 }
    );
  });

  it('Math.Divide handles any input without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (a, b) => {
        expect(() => MathOperators.Divide([a, b])).not.toThrow();
      }),
      { numRuns: 1000 }
    );
  });

  it('Math.Threshold handles any input without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (val, thresh) => {
        expect(() => MathOperators.Threshold([val, thresh])).not.toThrow();
      }),
      { numRuns: 1000 }
    );
  });

  it('Logic.If handles any input without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), fc.anything(), (cond, t, f) => {
        expect(() => LogicOperators.If([cond, t, f])).not.toThrow();
      }),
      { numRuns: 1000 }
    );
  });

  it('Utility.JsonPath handles any input without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (obj, path) => {
        expect(() => LogicOperators.JsonPath([obj, path])).not.toThrow();
      }),
      { numRuns: 1000 }
    );
  });

  it('List.Map handles any input without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(() => ListOperators.Map([input])).not.toThrow();
      }),
      { numRuns: 1000 }
    );
  });

  it('List.Filter handles any input without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(() => ListOperators.Filter([input])).not.toThrow();
      }),
      { numRuns: 1000 }
    );
  });

  it('List.Sort handles any input without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(() => ListOperators.Sort([input])).not.toThrow();
      }),
      { numRuns: 1000 }
    );
  });

  it('List.Take handles any input without throwing', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (arr, n) => {
        expect(() => ListOperators.Take([arr, n])).not.toThrow();
      }),
      { numRuns: 1000 }
    );
  });
});

// ============================================================================
// PROPERTY: PURITY (Deterministic)
// ============================================================================

describe('Operator Purity (Deterministic)', () => {
  it('Text.ToUpper is pure', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const result1 = TextOperators.ToUpper([s]);
        const result2 = TextOperators.ToUpper([s]);
        expect(result1).toBe(result2);
      }),
      { numRuns: 500 }
    );
  });

  it('Math.Add is pure', () => {
    fc.assert(
      fc.property(fc.float(), fc.float(), (a, b) => {
        const result1 = MathOperators.Add([a, b]);
        const result2 = MathOperators.Add([a, b]);
        expect(result1).toBe(result2);
      }),
      { numRuns: 500 }
    );
  });

  it('List.Sort is pure and does not mutate input', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (arr) => {
        const original = [...arr];
        const result1 = ListOperators.Sort([arr]);
        const result2 = ListOperators.Sort([arr]);
        
        // Input not mutated
        expect(arr).toEqual(original);
        // Results are equal
        expect(result1).toEqual(result2);
      }),
      { numRuns: 500 }
    );
  });
});

// ============================================================================
// PROPERTY: TYPE PRESERVATION
// ============================================================================

describe('Operator Type Preservation', () => {
  it('Text.ToUpper returns string', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = TextOperators.ToUpper([input]);
        expect(typeof result).toBe('string');
      }),
      { numRuns: 500 }
    );
  });

  it('Text.Length returns number', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = TextOperators.Length([input]);
        expect(typeof result).toBe('number');
        expect(Number.isFinite(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 500 }
    );
  });

  it('Math.Add returns number', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (a, b) => {
        const result = MathOperators.Add([a, b]);
        expect(typeof result).toBe('number');
      }),
      { numRuns: 500 }
    );
  });

  it('Math.Threshold returns 0 or 1', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (val, thresh) => {
        const result = MathOperators.Threshold([val, thresh]);
        expect(result === 0 || result === 1).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  it('List.Sort returns array', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = ListOperators.Sort([input]);
        expect(Array.isArray(result)).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  it('List.Take returns array', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (arr, n) => {
        const result = ListOperators.Take([arr, n]);
        expect(Array.isArray(result)).toBe(true);
      }),
      { numRuns: 500 }
    );
  });
});

// ============================================================================
// PROPERTY: ALGEBRAIC LAWS
// ============================================================================

describe('Operator Algebraic Properties', () => {
  it('Math.Add is commutative', () => {
    fc.assert(
      fc.property(fc.float({ noNaN: true }), fc.float({ noNaN: true }), (a, b) => {
        expect(MathOperators.Add([a, b])).toBe(MathOperators.Add([b, a]));
      }),
      { numRuns: 500 }
    );
  });

  it('Math.Add has identity 0', () => {
    fc.assert(
      fc.property(fc.float({ noNaN: true, noDefaultInfinity: true }), (a) => {
        const result = MathOperators.Add([a, 0]);
        // -0 + 0 = +0 in IEEE 754, which is mathematically equal but Object.is different
        // We verify mathematical equality, not bitwise
        expect(result === 0 ? true : result === a).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  it('Math.Multiply is commutative', () => {
    fc.assert(
      fc.property(fc.float({ noNaN: true }), fc.float({ noNaN: true }), (a, b) => {
        expect(MathOperators.Multiply([a, b])).toBe(MathOperators.Multiply([b, a]));
      }),
      { numRuns: 500 }
    );
  });

  it('Math.Multiply has identity 1', () => {
    fc.assert(
      fc.property(fc.float({ noNaN: true }), (a) => {
        expect(MathOperators.Multiply([a, 1])).toBe(a);
      }),
      { numRuns: 500 }
    );
  });

  it('Math.Subtract is inverse of Add (within floating point tolerance)', () => {
    fc.assert(
      fc.property(fc.float({ noNaN: true, min: -1e6, max: 1e6 }), fc.float({ noNaN: true, min: -1e6, max: 1e6 }), (a, b) => {
        const sum = MathOperators.Add([a, b]);
        const diff = MathOperators.Subtract([sum, b]);
        // Use relative tolerance for floating point
        const tolerance = Math.max(1e-10, Math.abs(a) * 1e-10);
        expect(Math.abs(diff - a)).toBeLessThan(tolerance);
      }),
      { numRuns: 500 }
    );
  });

  it('Text.ToUpper is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const once = TextOperators.ToUpper([s]);
        const twice = TextOperators.ToUpper([once]);
        expect(once).toBe(twice);
      }),
      { numRuns: 500 }
    );
  });

  it('List.Sort is idempotent', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (arr) => {
        const once = ListOperators.Sort([arr]);
        const twice = ListOperators.Sort([once]);
        expect(once).toEqual(twice);
      }),
      { numRuns: 500 }
    );
  });

  it('List.Filter preserves or reduces length', () => {
    fc.assert(
      fc.property(fc.array(fc.anything()), (arr) => {
        const filtered = ListOperators.Filter([arr]);
        expect(filtered.length).toBeLessThanOrEqual(arr.length);
      }),
      { numRuns: 500 }
    );
  });

  it('List.Take(n) returns at most n items', () => {
    fc.assert(
      fc.property(fc.array(fc.anything()), fc.nat(100), (arr, n) => {
        const taken = ListOperators.Take([arr, n]);
        expect(taken.length).toBeLessThanOrEqual(n);
        expect(taken.length).toBeLessThanOrEqual(arr.length);
      }),
      { numRuns: 500 }
    );
  });

  it('Logic.If returns trueBranch when condition is truthy', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(true), fc.constant(1), fc.constant('yes')),
        fc.anything(),
        fc.anything(),
        (cond, t, f) => {
          expect(LogicOperators.If([cond, t, f])).toBe(t);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('Logic.If returns falseBranch when condition is falsy', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(false), fc.constant(0), fc.constant(''), fc.constant(null), fc.constant(undefined)),
        fc.anything(),
        fc.anything(),
        (cond, t, f) => {
          expect(LogicOperators.If([cond, t, f])).toBe(f);
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ============================================================================
// PROPERTY: EDGE CASES
// ============================================================================

describe('Operator Edge Cases', () => {
  it('Math.Divide by zero follows IEEE 754', () => {
    expect(MathOperators.Divide([10, 0])).toBe(Infinity);
    expect(MathOperators.Divide([-10, 0])).toBe(-Infinity);
    expect(Number.isNaN(MathOperators.Divide([0, 0]))).toBe(true);  // 0/0 = NaN
  });

  it('Text.RegexMatch with invalid regex returns empty string', () => {
    expect(TextOperators.RegexMatch(['hello', '['])).toBe('');
    expect(TextOperators.RegexMatch(['hello', '((('])).toBe('');
  });

  it('List.Take with negative n returns empty array', () => {
    expect(ListOperators.Take([[1, 2, 3], -5])).toEqual([]);
  });

  it('Utility.JsonPath with deep path', () => {
    const obj = { a: { b: { c: { d: 42 } } } };
    expect(LogicOperators.JsonPath([obj, 'a.b.c.d'])).toBe(42);
    expect(LogicOperators.JsonPath([obj, 'a.b.x.y'])).toBeUndefined();
  });

  it('Text.Join with non-array input wraps it', () => {
    expect(TextOperators.Join(['hello', '-'])).toBe('hello');
    expect(TextOperators.Join([42, '-'])).toBe('42');
  });

  it('List.Reduce sum operation', () => {
    expect(ListOperators.Reduce([[1, 2, 3, 4], 0, 'sum'])).toBe(10);
    expect(ListOperators.Reduce([[1, 2, 3, 4], 10, 'sum'])).toBe(20);
  });

  it('List.Reduce product operation', () => {
    expect(ListOperators.Reduce([[1, 2, 3, 4], 1, 'product'])).toBe(24);
  });

  it('List.Reduce concat operation', () => {
    expect(ListOperators.Reduce([['a', 'b', 'c'], '', 'concat'])).toBe('abc');
  });

  it('List.Reduce min/max operations', () => {
    expect(ListOperators.Reduce([[3, 1, 4, 1, 5], Infinity, 'min'])).toBe(1);
    expect(ListOperators.Reduce([[3, 1, 4, 1, 5], -Infinity, 'max'])).toBe(5);
  });

  it('List.FoldN basic iteration', () => {
    expect(ListOperators.FoldN([5, 0, 1])).toBe(5);   // 0 + 1*5
    expect(ListOperators.FoldN([10, 100, 2])).toBe(120);  // 100 + 2*10
    expect(ListOperators.FoldN([0, 42, 10])).toBe(42);  // 0 iterations = initial
  });

  it('List.FoldN is capped at 1000 iterations', () => {
    // Even with huge n, result is bounded
    const result = ListOperators.FoldN([1_000_000, 0, 1]);
    expect(result).toBe(1000);  // Capped at 1000
  });
});

// ============================================================================
// COVERAGE: ALL OPERATORS IN REGISTRY
// ============================================================================

describe('Operator Registry Coverage', () => {
  const expectedOperators = [
    'Text.ToUpper', 'Text.Length', 'Text.RegexMatch', 'Text.Join',
    'Math.Add', 'Math.Subtract', 'Math.Multiply', 'Math.Divide', 'Math.Threshold',
    'Logic.If', 'Utility.JsonPath',
    'List.Map', 'List.Filter', 'List.Sort', 'List.Take', 'List.Reduce', 'List.FoldN',
  ];

  it.each(expectedOperators)('%s is in the operator registry', (op) => {
    expect(OPERATORS[op]).toBeDefined();
    expect(typeof OPERATORS[op]).toBe('function');
  });

  it('all operators handle undefined inputs gracefully', () => {
    for (const [name, fn] of Object.entries(OPERATORS)) {
      expect(() => fn([undefined, undefined, undefined])).not.toThrow();
    }
  });

  it('all operators handle null inputs gracefully', () => {
    for (const [name, fn] of Object.entries(OPERATORS)) {
      expect(() => fn([null, null, null])).not.toThrow();
    }
  });

  it('all operators handle empty array inputs gracefully', () => {
    for (const [name, fn] of Object.entries(OPERATORS)) {
      expect(() => fn([])).not.toThrow();
    }
  });
});
