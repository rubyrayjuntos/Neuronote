# Semantic Validation Checks

> **Facets**: stage: validation | trust: gatekeeper | domain: verification | type: technique

## What Are Semantic Checks?

Semantic checks are **deep verification passes** that go beyond schema validation. While Zod validates structure, semantic checks validate meaning—ensuring the app makes sense as a whole.

## Location

[utils/validator.ts](../../utils/validator.ts)

## Verification Phases

After Zod parsing succeeds, semantic verification runs these checks:

```typescript
export function verifyProposal(appDef: AppDefinition): VerificationResult {
  const errors: string[] = [];
  
  errors.push(...validateStructure(appDef));
  errors.push(...validatePipelines(appDef));
  errors.push(...validateBindings(appDef));
  errors.push(...validateEventWiring(appDef));
  
  return { valid: errors.length === 0, errors };
}
```

## 1. Structure Validation

Ensures the view tree is well-formed:

```typescript
function validateStructure(appDef: AppDefinition): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  
  function walkNode(node: ViewNode, path: string) {
    // Check for duplicate IDs
    if (ids.has(node.id)) {
      errors.push(`Duplicate view ID: ${node.id} at ${path}`);
    }
    ids.add(node.id);
    
    // Validate component type exists
    if (!componentRegistry.has(node.type)) {
      errors.push(`Unknown component type: ${node.type} at ${path}`);
    }
    
    // Recurse into children
    node.children?.forEach((child, i) => 
      walkNode(child, `${path}.children[${i}]`)
    );
  }
  
  walkNode(appDef.view, 'view');
  return errors;
}
```

## 2. Pipeline Validation

Ensures dataflow graphs are executable:

```typescript
function validatePipelines(appDef: AppDefinition): string[] {
  const errors: string[] = [];
  
  for (const [id, pipeline] of Object.entries(appDef.pipelines)) {
    // Check all operators exist
    for (const node of pipeline.nodes) {
      if (!operatorRegistry.has(node.op)) {
        errors.push(`Pipeline ${id}: unknown operator ${node.op}`);
      }
    }
    
    // Check all $inputs are declared
    for (const node of pipeline.nodes) {
      for (const [key, value] of Object.entries(node.inputs)) {
        if (typeof value === 'string' && value.startsWith('$')) {
          const inputName = value.slice(1);
          if (!(inputName in pipeline.inputs)) {
            errors.push(`Pipeline ${id}: undeclared input $${inputName}`);
          }
        }
      }
    }
    
    // Check for cycles (DAG validation)
    if (hasCycle(pipeline.nodes)) {
      errors.push(`Pipeline ${id}: contains cycle`);
    }
    
    // Check output exists
    if (!pipeline.nodes.some(n => n.id === pipeline.output)) {
      errors.push(`Pipeline ${id}: output ${pipeline.output} not found`);
    }
  }
  
  return errors;
}
```

## 3. Binding Validation

Ensures context references are valid:

```typescript
function validateBindings(appDef: AppDefinition): string[] {
  const errors: string[] = [];
  const contextKeys = new Set(Object.keys(appDef.initialContext));
  
  function walkNode(node: ViewNode) {
    if (node.bindings) {
      for (const [prop, expr] of Object.entries(node.bindings)) {
        // Extract context.key references
        const refs = extractContextRefs(expr);
        for (const ref of refs) {
          if (!contextKeys.has(ref)) {
            errors.push(`Node ${node.id}: binding references unknown context.${ref}`);
          }
        }
      }
    }
    node.children?.forEach(walkNode);
  }
  
  walkNode(appDef.view);
  return errors;
}
```

## 4. Event Wiring Validation

Ensures UI events connect to machine handlers:

```typescript
function validateEventWiring(appDef: AppDefinition): string[] {
  const errors: string[] = [];
  const handledEvents = new Set<string>();
  
  // Collect all events handled by machine
  for (const state of Object.values(appDef.machine.states)) {
    if (state.on) {
      Object.keys(state.on).forEach(e => handledEvents.add(e));
    }
  }
  
  // Check all UI events have handlers
  function walkNode(node: ViewNode) {
    if (node.onEvent && !handledEvents.has(node.onEvent)) {
      errors.push(`Node ${node.id}: event ${node.onEvent} has no handler`);
    }
    node.children?.forEach(walkNode);
  }
  
  walkNode(appDef.view);
  return errors;
}
```

## Error Messages

Semantic errors are descriptive and actionable:

```
Pipeline calculateTotal: undeclared input $taxRate
Node submit-btn: event SUBMIT has no handler in any state
View node user-name: binding references unknown context.userName
```

## Relations

- **requires**: [app-definition](./app-definition.md)
- **part-of**: [gatekeeper-pipeline](./gatekeeper-pipeline.md)
- **see-also**: [zod-validation](./zod-validation.md), [test-vectors](./test-vectors.md)
