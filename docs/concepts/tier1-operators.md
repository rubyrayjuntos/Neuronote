# Tier 1 Operators

> **Facets**: stage: execution | trust: sandboxed | domain: execution | type: api

## What Are Tier 1 Operators?

**Tier 1 operators** are pure, deterministic functions that can run safely in the WASM sandbox. They have no side effects and no access to host capabilities.

## Location

Defined in [operators/registry.ts](../../operators/registry.ts) with `tier: 1`.

## Characteristics

| Property | Tier 1 |
|----------|--------|
| **Pure** | ✅ Same inputs → same output |
| **Deterministic** | ✅ No randomness |
| **Side effects** | ❌ None allowed |
| **Async** | ❌ Synchronous only |
| **Host access** | ❌ No DOM, fetch, fs |

## Categories

### Math Operators
```typescript
const MathAdd: OperatorDef = {
  op: 'Math.Add',
  tier: 1,
  pure: true,
  inputs: [
    { name: 'a', type: 'number' },
    { name: 'b', type: 'number' }
  ],
  output: { type: 'number' },
  impl: ({ a, b }) => a + b,
};
```

Available: `Add`, `Subtract`, `Multiply`, `Divide`, `Modulo`, `Round`, `Floor`, `Ceil`, `Abs`, `Min`, `Max`, `Pow`, `Sqrt`

### Text Operators
```typescript
const TextTemplate: OperatorDef = {
  op: 'Text.Template',
  tier: 1,
  pure: true,
  inputs: [
    { name: 'template', type: 'string' },
    { name: 'vars', type: 'object' }
  ],
  output: { type: 'string' },
  impl: ({ template, vars }) => 
    template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? ''),
};
```

Available: `Template`, `Concat`, `Split`, `Join`, `Trim`, `ToUpper`, `ToLower`, `Replace`, `Substring`, `Length`

### Image Operators
```typescript
const ImageGrayscale: OperatorDef = {
  op: 'Image.Grayscale',
  tier: 1,
  pure: true,
  inputs: [{ name: 'image', type: 'image' }],
  output: { type: 'image' },
  impl: ({ image }) => applyGrayscale(image),
};
```

Available: `Grayscale`, `Blur`, `Sharpen`, `Resize`, `Crop`, `Rotate`, `Flip`, `Brightness`, `Contrast`

### Logic Operators
```typescript
const LogicIf: OperatorDef = {
  op: 'Logic.If',
  tier: 1,
  pure: true,
  inputs: [
    { name: 'condition', type: 'boolean' },
    { name: 'then', type: 'any' },
    { name: 'else', type: 'any' }
  ],
  output: { type: 'any' },
  impl: ({ condition, then, else: otherwise }) => 
    condition ? then : otherwise,
};
```

Available: `If`, `And`, `Or`, `Not`, `Equals`, `NotEquals`, `GreaterThan`, `LessThan`

### Array Operators
```typescript
const ArrayMap: OperatorDef = {
  op: 'Array.Map',
  tier: 1,
  pure: true,
  inputs: [
    { name: 'array', type: 'array' },
    { name: 'fn', type: 'string' }  // Expression
  ],
  output: { type: 'array' },
  impl: ({ array, fn }) => array.map(item => evalExpr(fn, { item })),
};
```

Available: `Map`, `Filter`, `Reduce`, `First`, `Last`, `Length`, `Reverse`, `Sort`, `Concat`, `Unique`

### Data Operators
```typescript
const DataGet: OperatorDef = {
  op: 'Data.Get',
  tier: 1,
  pure: true,
  inputs: [
    { name: 'object', type: 'object' },
    { name: 'path', type: 'string' }
  ],
  output: { type: 'any' },
  impl: ({ object, path }) => getByPath(object, path),
};
```

Available: `Get`, `Set`, `Merge`, `Pick`, `Omit`, `Keys`, `Values`, `Entries`

## Pipeline Usage

```json
{
  "pipelines": {
    "processNumbers": {
      "inputs": { "a": "number", "b": "number" },
      "nodes": [
        { "id": "sum", "op": "Math.Add", "inputs": { "a": "$a", "b": "$b" } },
        { "id": "doubled", "op": "Math.Multiply", "inputs": { "a": "@sum", "b": 2 } },
        { "id": "label", "op": "Text.Template", "inputs": { 
          "template": "Result: {{value}}", 
          "vars": { "value": "@doubled" } 
        }}
      ],
      "output": "label"
    }
  }
}
```

## Why Tier 1?

Tier 1 restrictions enable:

1. **WASM execution**: No host dependencies
2. **Determinism**: Reproducible results
3. **Safety**: No side effects
4. **Caching**: Results can be memoized
5. **Testing**: Easy to unit test

## Relations

- **requires**: [wasm-sandbox](./wasm-sandbox.md)
- **part-of**: [operator-registry](./operator-registry.md)
- **see-also**: [tier2-operators](./tier2-operators.md), [pipelines](./pipelines.md)
