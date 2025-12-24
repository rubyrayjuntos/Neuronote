# Tier 2 Operators

> **Facets**: stage: execution | trust: trusted | domain: execution | type: api

## What Are Tier 2 Operators?

**Tier 2 operators** require host privileges and cannot run in the WASM sandbox. They perform I/O, access external resources, or have side effects.

## Location

Defined in [operators/registry.ts](../../operators/registry.ts) with `tier: 2`.

## Characteristics

| Property | Tier 2 |
|----------|--------|
| **Pure** | ❌ May have side effects |
| **Deterministic** | ❌ May vary |
| **Side effects** | ✅ Allowed |
| **Async** | ✅ Can return Promise |
| **Host access** | ✅ Full access |

## Categories

### IO Operators
```typescript
const IOFetch: OperatorDef = {
  op: 'IO.Fetch',
  tier: 2,
  pure: false,
  async: true,
  inputs: [
    { name: 'url', type: 'string' },
    { name: 'options', type: 'object', optional: true }
  ],
  output: { type: 'any' },
  impl: async ({ url, options }) => {
    const response = await fetch(url, options);
    return response.json();
  },
};
```

Available: `Fetch`, `FetchText`, `FetchBlob`

### Storage Operators
```typescript
const StorageSave: OperatorDef = {
  op: 'Storage.Save',
  tier: 2,
  pure: false,
  async: true,
  inputs: [
    { name: 'key', type: 'string' },
    { name: 'value', type: 'any' }
  ],
  output: { type: 'boolean' },
  impl: async ({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  },
};
```

Available: `Save`, `Load`, `Delete`, `List`

### Time Operators
```typescript
const TimeNow: OperatorDef = {
  op: 'Time.Now',
  tier: 2,
  pure: false,  // Not deterministic!
  inputs: [],
  output: { type: 'number' },
  impl: () => Date.now(),
};
```

Available: `Now`, `Format`, `Parse`, `Diff`

### Random Operators
```typescript
const RandomNumber: OperatorDef = {
  op: 'Random.Number',
  tier: 2,
  pure: false,  // Not deterministic!
  inputs: [
    { name: 'min', type: 'number', optional: true },
    { name: 'max', type: 'number', optional: true }
  ],
  output: { type: 'number' },
  impl: ({ min = 0, max = 1 }) => 
    Math.random() * (max - min) + min,
};
```

Available: `Number`, `Integer`, `Choice`, `Shuffle`, `UUID`

## Security Considerations

Tier 2 operators are reviewed carefully:

```typescript
// ❌ Dangerous - allows arbitrary code execution
const UnsafeEval: OperatorDef = {
  op: 'Unsafe.Eval',
  tier: 2,
  impl: ({ code }) => eval(code),  // NEVER DO THIS
};

// ✅ Safe - constrained API
const IOFetch: OperatorDef = {
  op: 'IO.Fetch',
  tier: 2,
  impl: async ({ url }) => {
    // Could add URL allowlist here
    if (!isAllowedUrl(url)) {
      throw new SecurityError('URL not allowed');
    }
    return fetch(url);
  },
};
```

## Execution

Tier 2 operators run in the host, not the sandbox:

```typescript
async function executePipeline(pipeline: Pipeline) {
  for (const node of topoSort(pipeline.nodes)) {
    const op = operatorRegistry.get(node.op);
    
    if (op.tier === 1) {
      // Run in WASM sandbox
      context[node.id] = await wasmKernel.execute(node.op, inputs);
    } else {
      // Run in host (tier 2)
      context[node.id] = await op.impl(inputs);
    }
  }
}
```

## Pipeline Usage

```json
{
  "pipelines": {
    "fetchAndProcess": {
      "inputs": { "url": "string" },
      "nodes": [
        { "id": "data", "op": "IO.Fetch", "inputs": { "url": "$url" } },
        { "id": "count", "op": "Array.Length", "inputs": { "array": "@data.items" } }
      ],
      "output": "count"
    }
  }
}
```

## Trust Model

Tier 2 operators are trusted because:
1. They're defined by the host, not AI
2. They have explicit, documented effects
3. They can implement access controls
4. They're audited before inclusion

## Adding Tier 2 Operators

New Tier 2 operators require careful review:

```typescript
// Proposal process:
// 1. Define clear input/output contract
// 2. Document all side effects
// 3. Implement security controls
// 4. Add to registry with tier: 2
// 5. Update SerenaBridge to expose to AI

const MyNewOperator: OperatorDef = {
  op: 'Category.MyOp',
  tier: 2,
  pure: false,
  async: true,
  description: 'Does X with Y side effects',
  // ... implementation
};
```

## Relations

- **part-of**: [operator-registry](./operator-registry.md)
- **see-also**: [tier1-operators](./tier1-operators.md)
- **uses**: [host-runtime](./host-runtime.md)
