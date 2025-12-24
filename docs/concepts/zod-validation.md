# Zod Validation

> **Facets**: stage: validation | trust: boundary | domain: schema | type: technique

## What is Zod Validation?

[Zod](https://zod.dev) is a TypeScript-first schema validation library that provides **runtime type checking**. In NeuroNote, Zod schemas serve as the authoritative definition of what constitutes a valid `AppDefinition`.

## Why Runtime Validation?

TypeScript types vanish at runtime—they're compile-time only. When AI generates a proposal, we receive arbitrary JSON. Zod bridges the gap:

```
TypeScript Types (compile-time) ← zod.infer<typeof schema>
                                    ↑
                                 Zod Schema (source of truth)
                                    ↓
AI JSON (runtime) ───────────────→ parse() ───→ validated data or ZodError
```

## Schema Location

All schemas live in [schemas/index.ts](../../schemas/index.ts):

```typescript
// The root schema
export const AppDefinitionSchema = z.object({
  version: z.string(),
  initialContext: z.record(z.unknown()),
  machine: MachineSchema,
  pipelines: z.record(PipelineSchema),
  view: ViewNodeSchema,
  testVectors: z.array(TestVectorSchema).optional(),
});

// Type inference from schema
export type AppDefinition = z.infer<typeof AppDefinitionSchema>;
```

## Key Sub-Schemas

### MachineSchema
Validates the finite state machine:
```typescript
const MachineSchema = z.object({
  initial: z.string(),
  states: z.record(StateSchema),
});
```

### ViewNodeSchema
Recursive schema for UI tree:
```typescript
const ViewNodeSchema: z.ZodType<ViewNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.string(),
    children: z.array(ViewNodeSchema).optional(),
    bindings: z.record(z.string()).optional(),
    // ...
  })
);
```

### PipelineSchema
Validates dataflow graphs:
```typescript
const PipelineSchema = z.object({
  inputs: z.record(z.string()),
  nodes: z.array(NodeSchema),
  output: z.string(),
});
```

## Error Messages

Zod provides structured errors with paths:

```typescript
const result = AppDefinitionSchema.safeParse(aiOutput);

if (!result.success) {
  result.error.issues.forEach(issue => {
    console.log(`Path: ${issue.path.join('.')}`);
    console.log(`Error: ${issue.message}`);
  });
}
```

Example error output:
```
Path: view.children.0.type
Error: Invalid enum value. Expected 'Input.Text' | 'Input.Image' | ..., received 'textinput'
```

## Integration with repairProposal

Before Zod validation, `repairProposal()` auto-fixes common AI mistakes:

```typescript
// In validator.ts
export function validateAndRepair(raw: unknown): AppDefinition {
  // Step 1: Auto-repair known issues
  const repaired = repairProposal(raw);
  
  // Step 2: Zod validation
  const result = AppDefinitionSchema.safeParse(repaired);
  
  if (!result.success) {
    throw new ValidationError(result.error);
  }
  
  return result.data;
}
```

## Custom Refinements

Zod supports `.refine()` for custom validation logic:

```typescript
const NodeSchema = z.object({
  id: z.string(),
  op: z.string(),
  inputs: z.record(z.unknown()),
}).refine(
  node => operatorRegistry.has(node.op),
  node => ({ message: `Unknown operator: ${node.op}` })
);
```

## Relations

- **requires**: [schemas-index](./schemas-index.md)
- **enables**: [gatekeeper-pipeline](./gatekeeper-pipeline.md)
- **part-of**: [gatekeeper-pipeline](./gatekeeper-pipeline.md)
- **see-also**: [repair-proposal](./repair-proposal.md)
