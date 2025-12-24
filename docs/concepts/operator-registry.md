# Operator Registry

> **Facets**: stage: execution | trust: host | domain: runtime | type: component

## What is the Operator Registry?

The **Operator Registry** is a catalogue of 45+ pure dataflow operators that pipelines can reference. Each operator is a verified, deterministic transformation with declared inputs and outputs.

## Location

[operators/registry.ts](../../operators/registry.ts)

## Operator Structure

Every operator follows this interface:

```typescript
interface OperatorDef {
  op: string;           // PascalCase identifier: "Category.Name"
  category: string;     // Grouping: "math", "image", "text", etc.
  tier: 1 | 2;          // 1 = WASM sandbox, 2 = Host-only
  pure: boolean;        // No side effects
  async: boolean;       // Returns Promise?
  inputs: InputSpec[];  // Typed input parameters
  output: OutputSpec;   // Return type
  description: string;  // Human-readable docs
  impl: Function;       // The actual implementation
}
```

## Categories

| Category | Examples | Purpose |
|----------|----------|---------|
| **Math** | Add, Subtract, Multiply, Divide, Round | Numeric operations |
| **Text** | Template, Concat, Split, Trim, Regex | String manipulation |
| **Image** | Grayscale, Blur, Resize, Crop | Image processing |
| **Logic** | If, And, Or, Not, Equals | Conditional logic |
| **Array** | Map, Filter, Reduce, First, Length | Collection operations |
| **Data** | Get, Set, Merge, Pick, Keys | Object manipulation |
| **IO** | Fetch, Parse, Stringify | External data |

## Tier System

### Tier 1: WASM Sandboxed
```typescript
{
  op: 'Math.Add',
  tier: 1,  // Can run in WASM sandbox
  pure: true,
  impl: ({ a, b }) => a + b,
}
```

Tier 1 operators:
- Pure functions with no side effects
- Deterministic output for same inputs
- Can be safely run in untrusted WASM kernel

### Tier 2: Host-Only
```typescript
{
  op: 'IO.Fetch',
  tier: 2,  // Host-only, requires trust
  pure: false,
  async: true,
  impl: async ({ url }) => {
    const response = await fetch(url);
    return response.json();
  },
}
```

Tier 2 operators:
- May have side effects
- Require host environment capabilities
- Subject to additional security review

## Using Operators in Pipelines

Pipelines reference operators by their `op` name:

```json
{
  "pipelines": {
    "addNumbers": {
      "inputs": { "x": "number", "y": "number" },
      "nodes": [
        { "id": "sum", "op": "Math.Add", "inputs": { "a": "$x", "b": "$y" } }
      ],
      "output": "sum"
    }
  }
}
```

## Input References

Within a pipeline, inputs can reference:

| Syntax | Meaning | Example |
|--------|---------|---------|
| `$name` | Pipeline input parameter | `$x`, `$image` |
| `@nodeId` | Output of another node | `@sum`, `@gray` |
| literal | Direct value | `5`, `"hello"` |

## Adding New Operators

```typescript
// In operators/registry.ts
const MyNewOperator: OperatorDef = {
  op: 'Category.MyOp',
  category: 'category',
  tier: 1,
  pure: true,
  async: false,
  inputs: [
    { name: 'input', type: 'string', description: 'The input value' }
  ],
  output: { name: 'result', type: 'string', description: 'Transformed output' },
  description: 'Does something useful',
  impl: ({ input }) => input.toUpperCase(),
};

// Register it
registerOperator(MyNewOperator);
```

## Validation

The [gatekeeper-pipeline](./gatekeeper-pipeline.md) validates that:
1. Every `op` in a pipeline exists in the registry
2. Input types match operator expectations
3. DAG has no cycles
4. Output node exists

## SerenaBridge Integration

The [serena-bridge](./serena-bridge.md) provides operator specs to AI in two modes:
- **Menu mode**: Brief signatures for token efficiency
- **Specs mode**: Full details when AI needs them

## Relations

- **enables**: [pipelines](./pipelines.md)
- **part-of**: [host-runtime](./host-runtime.md)
- **uses**: [wasm-sandbox](./wasm-sandbox.md)
- **see-also**: [serena-bridge](./serena-bridge.md), [tier-system](./tier-system.md)
