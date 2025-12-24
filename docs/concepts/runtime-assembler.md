# Runtime Assembler

> **Facets**: stage: execution | trust: host | domain: runtime | type: component

## What is the Runtime Assembler?

The **Runtime Assembler** transforms a verified `AppDefinition` into a running React application. It's the "interpreter" that brings declarative schemas to life.

## Location

[runtime/RuntimeAssembler.tsx](../../runtime/RuntimeAssembler.tsx)

## Architecture Position

```
AppDefinition (data) → RuntimeAssembler → Live React App
                              ↓
                    ComponentRegistry (maps types to components)
                              ↓
                    HostRuntime (event dispatch, state machine)
```

## Core Responsibilities

### 1. View Tree Rendering
Recursively transforms `ViewNode` structures into React elements:

```typescript
function renderViewNode(node: ViewNode): React.ReactElement {
  const Component = ComponentRegistry.get(node.type);
  
  const resolvedProps = resolveBindings(node.bindings, context);
  
  return (
    <Component
      key={node.id}
      {...resolvedProps}
      onEvent={(event, payload) => dispatch(node.onEvent, payload)}
    >
      {node.children?.map(child => renderViewNode(child))}
    </Component>
  );
}
```

### 2. Binding Resolution
Connects UI to state via binding expressions:

```typescript
// ViewNode with bindings
{
  id: "counter-display",
  type: "Display.Text",
  bindings: {
    text: "context.count",
    visible: "context.count > 0"
  }
}

// Resolved at render time
function resolveBindings(bindings: Record<string, string>, context: Context) {
  return Object.fromEntries(
    Object.entries(bindings).map(([prop, expr]) => [
      prop,
      evaluateExpression(expr, context)
    ])
  );
}
```

### 3. Event Wiring
Connects UI events to the state machine:

```typescript
// ViewNode with onEvent
{
  id: "increment-btn",
  type: "Control.Button",
  onEvent: "INCREMENT"
}

// When clicked, dispatches to machine
function handleComponentEvent(eventType: string, payload: any) {
  const machine = useMachine();
  machine.send({ type: eventType, ...payload });
}
```

### 4. Pipeline Execution
Runs dataflow pipelines when triggered:

```typescript
async function executePipeline(pipelineId: string, inputs: Context) {
  const pipeline = appDef.pipelines[pipelineId];
  const nodes = topoSort(pipeline.nodes);
  
  let ctx = { ...inputs };
  for (const node of nodes) {
    const op = operatorRegistry.get(node.op);
    const resolvedInputs = resolveNodeInputs(node.inputs, ctx);
    ctx[node.id] = await op.impl(resolvedInputs);
  }
  
  return ctx[pipeline.output];
}
```

## Component Registry Integration

The assembler delegates component creation to the [component-registry](./component-registry.md):

```typescript
// ComponentRegistry.tsx
const registry: Record<string, React.ComponentType> = {
  'Control.Button': ButtonComponent,
  'Input.Text': TextInputComponent,
  'Input.Image': ImageInputComponent,
  'Display.Text': TextDisplayComponent,
  'Display.Chart': ChartComponent,
  'Layout.Stack': StackLayout,
  'Layout.Grid': GridLayout,
  // ...
};

export function get(type: string): React.ComponentType {
  const component = registry[type];
  if (!component) {
    console.warn(`Unknown component type: ${type}`);
    return FallbackComponent;
  }
  return component;
}
```

## Example Flow

Given this AppDefinition snippet:

```json
{
  "view": {
    "id": "root",
    "type": "Layout.Stack",
    "children": [
      {
        "id": "title",
        "type": "Display.Text",
        "bindings": { "text": "'Hello, World!'" }
      },
      {
        "id": "counter",
        "type": "Display.Text",
        "bindings": { "text": "context.count" }
      },
      {
        "id": "btn",
        "type": "Control.Button",
        "bindings": { "label": "'Increment'" },
        "onEvent": "INCREMENT"
      }
    ]
  }
}
```

The RuntimeAssembler produces:

```jsx
<StackLayout>
  <TextDisplay text="Hello, World!" />
  <TextDisplay text={context.count} />
  <Button label="Increment" onClick={() => dispatch('INCREMENT')} />
</StackLayout>
```

## Hot Reload

When a new AppDefinition is applied, the assembler re-renders:

```typescript
function HostRuntime() {
  const appDef = useAppStore(state => state.appDef);
  
  // Re-renders when appDef changes
  return (
    <MachineProvider machine={appDef.machine}>
      <RuntimeAssembler appDef={appDef} />
    </MachineProvider>
  );
}
```

## Relations

- **requires**: [component-registry](./component-registry.md)
- **requires**: [operator-registry](./operator-registry.md)
- **uses**: [store-comonad](./store-comonad.md)
- **part-of**: [host-runtime](./host-runtime.md)
- **see-also**: [view-tree](./view-tree.md)
