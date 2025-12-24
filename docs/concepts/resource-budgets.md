# Resource Budgets

> **Facets**: stage: execution | trust: sandboxed | domain: execution | type: technique

## What Are Resource Budgets?

**Resource budgets** are limits on computation resources during pipeline execution. They prevent infinite loops, memory bombs, and denial-of-service from malicious or buggy pipelines.

## Location

- Configuration: [constants.ts](../../constants.ts)
- Enforcement: [services/WasmKernel.ts](../../services/WasmKernel.ts)

## Budget Types

### 1. Time Limit
Maximum execution time per pipeline:

```typescript
const PIPELINE_TIMEOUT_MS = 5000; // 5 seconds

async function executePipeline(pipeline: Pipeline) {
  const timeout = setTimeout(() => {
    throw new TimeoutError('Pipeline exceeded time limit');
  }, PIPELINE_TIMEOUT_MS);
  
  try {
    return await runPipeline(pipeline);
  } finally {
    clearTimeout(timeout);
  }
}
```

### 2. Memory Limit
Maximum memory allocation in WASM:

```typescript
const WASM_MEMORY_PAGES = 256; // 16MB (256 × 64KB)

const memory = new WebAssembly.Memory({
  initial: 16,    // Start with 1MB
  maximum: WASM_MEMORY_PAGES
});
```

### 3. Operation Count
Maximum number of operator invocations:

```typescript
const MAX_OPERATIONS = 1000;

let opCount = 0;

function executeNode(node: Node) {
  opCount++;
  if (opCount > MAX_OPERATIONS) {
    throw new BudgetExceededError('Too many operations');
  }
  return operator.impl(node.inputs);
}
```

### 4. Recursion Depth
Maximum call stack depth:

```typescript
const MAX_RECURSION = 100;

function executeWithDepth(fn: () => any, depth = 0) {
  if (depth > MAX_RECURSION) {
    throw new BudgetExceededError('Recursion limit exceeded');
  }
  return fn();
}
```

## Configuration

```typescript
// constants.ts
export const RESOURCE_BUDGETS = {
  pipeline: {
    timeoutMs: 5000,
    maxOperations: 1000,
  },
  wasm: {
    memoryPagesInitial: 16,
    memoryPagesMax: 256,
    stackSizeBytes: 1024 * 1024, // 1MB
  },
  recursion: {
    maxDepth: 100,
  },
};
```

## Enforcement in WASM

The WASM sandbox enforces budgets at the VM level:

```typescript
class WasmKernel {
  private memory: WebAssembly.Memory;
  private startTime: number;
  
  async execute(op: string, inputs: any): Promise<any> {
    this.startTime = Date.now();
    
    // Check time budget periodically
    const checkBudget = () => {
      const elapsed = Date.now() - this.startTime;
      if (elapsed > RESOURCE_BUDGETS.pipeline.timeoutMs) {
        this.abort();
        throw new TimeoutError();
      }
    };
    
    // Set up periodic checks
    const interval = setInterval(checkBudget, 100);
    
    try {
      return await this.runInSandbox(op, inputs);
    } finally {
      clearInterval(interval);
    }
  }
}
```

## Error Handling

Budget violations produce clear errors:

```typescript
class BudgetExceededError extends Error {
  constructor(
    public budgetType: 'time' | 'memory' | 'operations' | 'recursion',
    public limit: number,
    public actual: number
  ) {
    super(`${budgetType} budget exceeded: ${actual} > ${limit}`);
  }
}
```

## User Feedback

When budgets are exceeded, users see actionable messages:

```
⚠️ Pipeline Timeout

The image processing pipeline took longer than 5 seconds.
This might happen with very large images.

Try:
• Using a smaller image
• Simplifying the pipeline
• Breaking into multiple steps
```

## Why Budgets Matter

Without budgets, these attacks would work:

```json
// Infinite loop (caught by time/op limits)
{
  "nodes": [
    { "id": "loop", "op": "Array.Map", "inputs": { "array": "@loop" } }
  ]
}

// Memory bomb (caught by memory limit)
{
  "nodes": [
    { "id": "huge", "op": "Array.Fill", "inputs": { "size": 999999999 } }
  ]
}
```

## Relations

- **part-of**: [wasm-sandbox](./wasm-sandbox.md)
- **enables**: [tier1-operators](./tier1-operators.md)
- **see-also**: [pipelines](./pipelines.md)
