# Pipelines

> **Facets**: stage: execution | trust: host | domain: runtime | type: schema

## What Are Pipelines?

**Pipelines** are declarative dataflow graphs that transform inputs into outputs using operators. They're the computational heart of NeuroNote apps.

## Location

Defined in the `pipelines` property of every [AppDefinition](./app-definition.md).

## Structure

```typescript
interface Pipeline {
  inputs: Record<string, string>;   // Parameter declarations
  nodes: Node[];                     // Processing steps
  output: string;                    // Final result node ID
}

interface Node {
  id: string;                        // Unique identifier
  op: string;                        // Operator name
  inputs: Record<string, any>;       // Input bindings
}
```

## Example: Simple Math

```json
{
  "pipelines": {
    "calculateTotal": {
      "inputs": { "price": "number", "quantity": "number" },
      "nodes": [
        { "id": "subtotal", "op": "Math.Multiply", "inputs": { "a": "$price", "b": "$quantity" } },
        { "id": "tax", "op": "Math.Multiply", "inputs": { "a": "@subtotal", "b": 0.08 } },
        { "id": "total", "op": "Math.Add", "inputs": { "a": "@subtotal", "b": "@tax" } }
      ],
      "output": "total"
    }
  }
}
```

## Input Reference Syntax

| Syntax | Meaning | Example |
|--------|---------|---------|
| `$name` | Pipeline input parameter | `$price`, `$image` |
| `@nodeId` | Output from another node | `@subtotal`, `@gray` |
| literal | Direct value | `5`, `"hello"`, `true` |

## Data Flow

Pipelines form a **Directed Acyclic Graph (DAG)**:

```
$price ──┐
         ├──► Math.Multiply ──► @subtotal ──┬──► Math.Add ──► @total
$quantity┘                                  │
                                            │
                            0.08 ───► Math.Multiply ──► @tax
                                            │
                                            └──────────────────┘
```

## Example: Image Processing

```json
{
  "pipelines": {
    "processImage": {
      "inputs": { "image": "image" },
      "nodes": [
        { "id": "gray", "op": "Image.Grayscale", "inputs": { "image": "$image" } },
        { "id": "blurred", "op": "Image.Blur", "inputs": { "image": "@gray", "radius": 5 } },
        { "id": "resized", "op": "Image.Resize", "inputs": { "image": "@blurred", "width": 300, "height": 200 } }
      ],
      "output": "resized"
    }
  }
}
```

## CRITICAL: Input Declaration Rule

**Every `$variable` in node inputs MUST be declared in the pipeline's `inputs`:**

```json
// ✅ Correct - $count is declared in inputs
{
  "inputs": { "count": "number" },
  "nodes": [
    { "id": "doubled", "op": "Math.Multiply", "inputs": { "a": "$count", "b": 2 } }
  ]
}

// ❌ FAILS VALIDATION - $count not declared
{
  "inputs": {},
  "nodes": [
    { "id": "doubled", "op": "Math.Multiply", "inputs": { "a": "$count", "b": 2 } }
  ]
}
```

## Execution

Pipelines are executed by topologically sorting nodes:

```typescript
async function executePipeline(pipeline: Pipeline, inputs: Context) {
  const ctx = { ...inputs };
  
  // Topological sort ensures dependencies run first
  for (const node of topoSort(pipeline.nodes)) {
    const op = operatorRegistry.get(node.op);
    const resolvedInputs = resolveNodeInputs(node.inputs, ctx);
    ctx[node.id] = await op.impl(resolvedInputs);
  }
  
  return ctx[pipeline.output];
}

function resolveNodeInputs(inputs: Record<string, any>, ctx: Context) {
  return Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => {
      if (typeof value === 'string') {
        if (value.startsWith('$')) return [key, ctx[value.slice(1)]];
        if (value.startsWith('@')) return [key, ctx[value.slice(1)]];
      }
      return [key, value];
    })
  );
}
```

## Validation

The [gatekeeper-pipeline](./gatekeeper-pipeline.md) validates:

1. **Operator existence**: Every `op` is in the registry
2. **Input declaration**: Every `$var` is declared in `inputs`
3. **DAG structure**: No cycles allowed
4. **Output exists**: `output` references a valid node ID
5. **Type compatibility**: Input types match operator expectations

## Triggering Pipelines

Pipelines can be triggered from machine actions:

```json
{
  "machine": {
    "states": {
      "idle": {
        "on": {
          "CALCULATE": { "target": "idle", "actions": ["runCalculation"] }
        }
      }
    }
  },
  "pipelines": {
    "calculation": { ... }
  }
}
```

## Relations

- **uses**: [operator-registry](./operator-registry.md)
- **part-of**: [app-definition](./app-definition.md)
- **enables**: [runtime-assembler](./runtime-assembler.md)
- **see-also**: [wasm-sandbox](./wasm-sandbox.md)
