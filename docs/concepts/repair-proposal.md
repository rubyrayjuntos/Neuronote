# repairProposal

> **Facets**: stage: validation | trust: boundary | domain: schema | type: technique

## What is repairProposal?

`repairProposal()` is an auto-repair function that fixes common AI mistakes before Zod validation. It's the first step in the [gatekeeper-pipeline](./gatekeeper-pipeline.md).

## Location

[schemas/index.ts](../../schemas/index.ts)

## Why Auto-Repair?

AI models make predictable mistakes:
- Lowercase component types (`input.text` instead of `Input.Text`)
- Children as object instead of array
- Missing required fields with obvious defaults
- Trailing commas in JSON
- Inconsistent casing

Rather than reject and retry (expensive), we fix these automatically.

## Common Repairs

### 1. Component Type Casing

```typescript
// AI produces:
{ type: "input.image" }

// repairProposal fixes to:
{ type: "Input.Image" }
```

Implementation:
```typescript
function repairComponentType(type: string): string {
  // Convert "input.text" to "Input.Text"
  return type.split('.').map(part => 
    part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  ).join('.');
}
```

### 2. Children Normalization

```typescript
// AI produces (object instead of array):
{ children: { id: "child1", type: "..." } }

// repairProposal fixes to:
{ children: [{ id: "child1", type: "..." }] }
```

### 3. Bindings Format

```typescript
// AI produces (direct value):
{ bindings: { text: 42 } }

// repairProposal fixes to:
{ bindings: { text: "42" } }
```

### 4. Event Name Normalization

```typescript
// AI produces:
{ onEvent: "click" }

// repairProposal fixes to:
{ onEvent: "CLICK" }
```

## Implementation

```typescript
export function repairProposal(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  
  const obj = raw as Record<string, unknown>;
  const repaired = { ...obj };
  
  // Fix version if missing
  if (!repaired.version) {
    repaired.version = generateVersion();
  }
  
  // Fix view tree
  if (repaired.view) {
    repaired.view = repairViewNode(repaired.view);
  }
  
  // Fix pipelines
  if (repaired.pipelines) {
    repaired.pipelines = repairPipelines(repaired.pipelines);
  }
  
  // Fix machine
  if (repaired.machine) {
    repaired.machine = repairMachine(repaired.machine);
  }
  
  return repaired;
}

function repairViewNode(node: unknown): unknown {
  if (!node || typeof node !== 'object') return node;
  
  const obj = node as Record<string, unknown>;
  const repaired = { ...obj };
  
  // Fix type casing
  if (typeof repaired.type === 'string') {
    repaired.type = repairComponentType(repaired.type);
  }
  
  // Fix children
  if (repaired.children && !Array.isArray(repaired.children)) {
    repaired.children = [repaired.children];
  }
  
  // Recurse into children
  if (Array.isArray(repaired.children)) {
    repaired.children = repaired.children.map(repairViewNode);
  }
  
  // Fix onEvent casing
  if (typeof repaired.onEvent === 'string') {
    repaired.onEvent = repaired.onEvent.toUpperCase();
  }
  
  return repaired;
}
```

## Repair vs. Reject

| Situation | Action |
|-----------|--------|
| Fixable with high confidence | Auto-repair |
| Ambiguous or risky | Reject, let AI retry |
| Structurally broken | Reject immediately |

Examples:
```typescript
// ✅ Auto-repair: obvious fix
"input.text" → "Input.Text"

// ❌ Reject: ambiguous
{ op: "add" }  // Math.Add? String concatenation?

// ❌ Reject: structural
{ view: null }  // Can't guess intent
```

## Integration in Pipeline

```typescript
// In validator.ts
export function validateAppDefinition(raw: unknown): AppDefinition {
  // Step 1: Auto-repair
  const repaired = repairProposal(raw);
  
  // Step 2: Zod validation
  const result = AppDefinitionSchema.safeParse(repaired);
  
  if (!result.success) {
    throw new ValidationError(result.error);
  }
  
  return result.data;
}
```

## Logging Repairs

For debugging, repairs are logged:

```typescript
function repairWithLogging(raw: unknown): unknown {
  const repairs: string[] = [];
  
  const repaired = repairProposal(raw, (msg) => repairs.push(msg));
  
  if (repairs.length > 0) {
    console.log('Auto-repairs applied:', repairs);
  }
  
  return repaired;
}
```

## Testing

```typescript
// In schemas.test.ts
describe('repairProposal', () => {
  it('fixes component type casing', () => {
    const input = { view: { type: 'input.text' } };
    const output = repairProposal(input);
    expect(output.view.type).toBe('Input.Text');
  });
  
  it('normalizes children to array', () => {
    const input = { view: { children: { id: 'x' } } };
    const output = repairProposal(input);
    expect(Array.isArray(output.view.children)).toBe(true);
  });
});
```

## Relations

- **part-of**: [gatekeeper-pipeline](./gatekeeper-pipeline.md)
- **enables**: [zod-validation](./zod-validation.md)
- **see-also**: [ai-proposal-format](./ai-proposal-format.md)
