# WASM Sandbox

> **Facets**: stage: execution | trust: untrusted | domain: security | type: component

## What is the WASM Sandbox?

The **WASM Sandbox** is an isolated execution environment where untrusted code (Tier 1 operators) can run safely. It provides deterministic execution with no access to the host system.

## Location

[services/WasmKernel.ts](../../services/WasmKernel.ts)

## Why Sandboxing?

AI-generated pipelines could theoretically contain malicious logic. The sandbox provides defense in depth:

```
┌─────────────────────────────────────────────────────────┐
│                    Host Runtime                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              WASM Sandbox (Guest)                  │ │
│  │                                                    │ │
│  │  • No filesystem access                           │ │
│  │  • No network access                              │ │
│  │  • No DOM access                                  │ │
│  │  • Memory isolated                                │ │
│  │  • CPU time bounded                               │ │
│  │                                                    │ │
│  │  Can only: compute pure transformations           │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Host-only capabilities (Tier 2):                        │
│  • Network requests       • Persistence                  │
│  • File I/O               • User interaction             │
└─────────────────────────────────────────────────────────┘
```

## Tier System Integration

Operators are classified by their sandbox eligibility:

| Tier | Sandbox | Trust | Examples |
|------|---------|-------|----------|
| **Tier 1** | WASM | Untrusted | Math.Add, Image.Grayscale, Text.Template |
| **Tier 2** | Host | Trusted | IO.Fetch, Storage.Save, DOM.Alert |

## API

```typescript
// In WasmKernel.ts
export class WasmKernel {
  private instance: WebAssembly.Instance;
  
  // Execute a Tier 1 operator in sandbox
  async execute(op: string, inputs: Record<string, any>): Promise<any> {
    // Serialize inputs
    const inputPtr = this.allocate(JSON.stringify(inputs));
    
    // Call sandboxed function
    const resultPtr = this.instance.exports.run_operator(op, inputPtr);
    
    // Deserialize result
    return JSON.parse(this.readString(resultPtr));
  }
  
  // Resource limits
  setMemoryLimit(bytes: number): void;
  setCpuLimit(ms: number): void;
}
```

## Security Properties

### 1. Memory Isolation
WASM linear memory is separate from JavaScript heap:
```typescript
const memory = new WebAssembly.Memory({ initial: 256, maximum: 512 });
// Sandbox can only access this memory, not host memory
```

### 2. No Ambient Authority
WASM modules have no implicit capabilities:
- No `fetch()`, `fs`, `process`, etc.
- Must explicitly import any needed functions
- We import nothing dangerous

### 3. Deterministic Execution
Same inputs → same outputs:
- No access to `Date.now()`, `Math.random()`
- Reproducible for testing and debugging

### 4. Resource Bounds
Prevent infinite loops and memory bombs:
```typescript
const timeout = setTimeout(() => kernel.abort(), 5000);
try {
  result = await kernel.execute(op, inputs);
} finally {
  clearTimeout(timeout);
}
```

## Current Implementation Status

The WASM kernel is currently **scaffolded but not fully implemented**. Tier 1 operators currently run in the JavaScript host with the same pure-function guarantees, but without true isolation.

Roadmap:
1. ✅ Operator tier classification
2. ✅ Pure function constraints
3. 🔄 WASM compilation of operators
4. ⏳ Full sandbox isolation

## How Pipelines Use It

```typescript
// In RuntimeAssembler.tsx
async function executePipeline(pipeline: Pipeline, context: Context) {
  const kernel = new WasmKernel();
  
  for (const node of topoSort(pipeline.nodes)) {
    const op = operatorRegistry.get(node.op);
    const inputs = resolveInputs(node.inputs, context);
    
    if (op.tier === 1) {
      // Safe to sandbox
      context[node.id] = await kernel.execute(node.op, inputs);
    } else {
      // Must run in host
      context[node.id] = await op.impl(inputs);
    }
  }
  
  return context[pipeline.output];
}
```

## Relations

- **enables**: [tier-system](./tier-system.md)
- **part-of**: [dual-kernel](./dual-kernel.md)
- **uses**: [operator-registry](./operator-registry.md)
- **see-also**: [security-model](./security-model.md)
