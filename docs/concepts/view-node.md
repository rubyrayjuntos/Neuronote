# View Node

> **Facets**: stage: proposal, validation, assembly | trust: untrusted, gatekeeper, trusted | domain: contracts, presentation | type: schema

## What is a View Node?

A **View Node** is a single element in the UI tree. View nodes form a recursive structure that describes the entire user interface declaratively.

## Location

Defined in `view` property of [AppDefinition](./app-definition.md) and in [schemas/index.ts](../../schemas/index.ts).

## Structure

```typescript
interface ViewNode {
  id: string;                              // Unique identifier
  type: string;                            // Component type (e.g., "Control.Button")
  children?: ViewNode[];                   // Nested elements
  bindings?: Record<string, string>;       // Context expressions
  onEvent?: string;                        // Event to dispatch
  valueBinding?: string;                   // Two-way binding for inputs
  props?: Record<string, unknown>;         // Static properties
}
```

## Component Type Naming

Types use **PascalCase with dot-separated categories**:

| Category | Examples |
|----------|----------|
| `Control.*` | Button, Slider, Toggle, Dropdown |
| `Input.*` | Text, Image, File, Number |
| `Display.*` | Text, Chart, Image, Table |
| `Layout.*` | Stack, Grid, Row, Column |

## Example: Simple Form

```json
{
  "view": {
    "id": "root",
    "type": "Layout.Stack",
    "children": [
      {
        "id": "title",
        "type": "Display.Text",
        "bindings": { "text": "'Enter your name'" }
      },
      {
        "id": "name-input",
        "type": "Input.Text",
        "valueBinding": "userName",
        "onEvent": "NAME_CHANGED"
      },
      {
        "id": "submit",
        "type": "Control.Button",
        "bindings": { "label": "'Submit'" },
        "onEvent": "SUBMIT"
      }
    ]
  }
}
```

## Bindings

Bindings connect view properties to context values:

```json
{
  "bindings": {
    "text": "context.count",           // Direct reference
    "visible": "context.count > 0",    // Expression
    "label": "'Click me'"              // Literal string
  }
}
```

## Event Wiring

`onEvent` dispatches to the state machine:

```json
{
  "id": "increment-btn",
  "type": "Control.Button",
  "onEvent": "INCREMENT"
}
```

When clicked, dispatches `{ type: "INCREMENT" }` to the machine.

## Two-Way Binding

`valueBinding` creates two-way data binding for inputs:

```json
{
  "id": "email",
  "type": "Input.Text",
  "valueBinding": "userEmail"
}
```

- Reads initial value from `context.userEmail`
- Updates `context.userEmail` when user types

## Validation

The [gatekeeper-pipeline](./gatekeeper-pipeline.md) validates:
- All `id` values are unique
- All `type` values exist in component registry
- All binding expressions reference valid context keys
- All `onEvent` values have handlers in the machine

## Relations

- **part-of**: [app-definition](./app-definition.md)
- **uses**: [context-binding](./context-binding.md)
- **enables**: [runtime-assembler](./runtime-assembler.md)
- **see-also**: [component-registry](./component-registry.md)
