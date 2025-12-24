# Context Binding

> **Facets**: stage: assembly, render | trust: trusted | domain: presentation, state | type: technique

## What is Context Binding?

**Context binding** connects view node properties to runtime state. It's the reactive glue between data and UI.

## Location

Implemented in [runtime/RuntimeAssembler.tsx](../../runtime/RuntimeAssembler.tsx).

## Binding Types

### 1. Read Binding (`bindings`)

One-way: context → UI

```json
{
  "id": "greeting",
  "type": "Display.Text",
  "bindings": {
    "text": "context.userName"
  }
}
```

When `context.userName` changes, the text updates.

### 2. Write Binding (`valueBinding`)

Two-way: context ↔ UI

```json
{
  "id": "name-input",
  "type": "Input.Text",
  "valueBinding": "userName"
}
```

- Reads from `context.userName`
- Writes to `context.userName` on input

### 3. Static Props (`props`)

No binding, just static values:

```json
{
  "id": "icon",
  "type": "Display.Image",
  "props": {
    "src": "/icons/star.svg",
    "width": 24
  }
}
```

## Expression Syntax

Bindings support expressions:

| Expression | Result |
|------------|--------|
| `context.count` | Value of count |
| `context.count + 1` | Computed value |
| `context.count > 0` | Boolean |
| `'Hello, ' + context.name` | String concatenation |
| `'Submit'` | Literal string |

## Resolution

```typescript
function resolveBindings(
  bindings: Record<string, string>,
  context: Context
): Record<string, any> {
  return Object.fromEntries(
    Object.entries(bindings).map(([prop, expr]) => [
      prop,
      evaluateExpression(expr, { context })
    ])
  );
}

function evaluateExpression(expr: string, env: { context: Context }): any {
  // Safe evaluation with limited scope
  const fn = new Function('context', `return ${expr}`);
  return fn(env.context);
}
```

## Security

Bindings are evaluated with restricted scope:
- Only `context` is accessible
- No access to `window`, `document`, `fetch`, etc.
- No function calls except safe operators

```typescript
// ✅ Allowed
"context.count * 2"
"context.name.toUpperCase()"

// ❌ Blocked (would be if implemented unsafely)
"fetch('/api/secret')"
"window.location.href"
```

## Re-render Optimization

Bindings are memoized to prevent unnecessary re-renders:

```typescript
const resolvedBindings = useMemo(
  () => resolveBindings(node.bindings, context),
  [node.bindings, context]
);
```

## Common Patterns

### Conditional Visibility
```json
{
  "bindings": {
    "visible": "context.isLoggedIn"
  }
}
```

### Dynamic Labels
```json
{
  "bindings": {
    "label": "'Count: ' + context.count"
  }
}
```

### Computed Styles
```json
{
  "bindings": {
    "className": "context.isError ? 'text-red' : 'text-green'"
  }
}
```

## Validation

The [semantic-checks](./semantic-checks.md) verify:
- All `context.X` references exist in `initialContext`
- Expressions are syntactically valid
- Types are compatible with component expectations

## Relations

- **uses**: [view-node](./view-node.md)
- **uses**: [zustand-store](./zustand-store.md)
- **part-of**: [runtime-assembler](./runtime-assembler.md)
- **see-also**: [event-dispatch](./event-dispatch.md)
