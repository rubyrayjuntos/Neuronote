# Component Registry

> **Facets**: stage: execution | trust: host | domain: runtime | type: component

## What is the Component Registry?

The **Component Registry** maps view node types (like `Input.Text`, `Display.Chart`) to actual React components. It's the bridge between declarative UI schemas and real UI elements.

## Location

[runtime/ComponentRegistry.tsx](../../runtime/ComponentRegistry.tsx)

## Structure

```typescript
type ComponentRegistry = Map<string, React.ComponentType<ComponentProps>>;

interface ComponentProps {
  id: string;
  bindings?: Record<string, any>;
  onEvent?: (event: string, payload?: any) => void;
  children?: React.ReactNode;
}
```

## Type Naming Convention

Component types use **PascalCase hierarchical naming**:

```
Category.Name
```

| Category | Purpose | Examples |
|----------|---------|----------|
| **Input** | User input | Input.Text, Input.Image, Input.Number |
| **Display** | Read-only output | Display.Text, Display.Image, Display.Chart |
| **Control** | Actions | Control.Button, Control.Toggle, Control.Dropdown |
| **Layout** | Structure | Layout.Stack, Layout.Grid, Layout.Split |
| **Container** | Grouping | Container.Card, Container.Modal, Container.Tab |

## Registration

```typescript
// In ComponentRegistry.tsx
const registry = new Map<string, React.ComponentType<ComponentProps>>();

// Register built-in components
registry.set('Input.Text', TextInput);
registry.set('Input.Image', ImageInput);
registry.set('Input.Number', NumberInput);
registry.set('Display.Text', TextDisplay);
registry.set('Display.Image', ImageDisplay);
registry.set('Display.Chart', ChartDisplay);
registry.set('Control.Button', Button);
registry.set('Layout.Stack', Stack);
registry.set('Layout.Grid', Grid);

export function get(type: string): React.ComponentType<ComponentProps> {
  return registry.get(type) || FallbackComponent;
}

export function register(type: string, component: React.ComponentType<ComponentProps>) {
  registry.set(type, component);
}
```

## Example Component

```tsx
// TextInput component
function TextInput({ id, bindings, onEvent }: ComponentProps) {
  const [value, setValue] = useState(bindings?.value || '');
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    onEvent?.('VALUE_CHANGED', { value: e.target.value });
  };
  
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={handleChange}
      placeholder={bindings?.placeholder}
      className={bindings?.className}
    />
  );
}
```

## Usage in RuntimeAssembler

```tsx
function renderViewNode(node: ViewNode): React.ReactElement {
  const Component = ComponentRegistry.get(node.type);
  
  return (
    <Component
      key={node.id}
      id={node.id}
      bindings={resolveBindings(node.bindings)}
      onEvent={(event, payload) => dispatch(node.onEvent || event, payload)}
    >
      {node.children?.map(renderViewNode)}
    </Component>
  );
}
```

## Fallback Component

Unknown types render a warning:

```tsx
function FallbackComponent({ id, bindings }: ComponentProps) {
  return (
    <div className="border border-yellow-500 p-2 text-yellow-500">
      Unknown component type for "{id}"
    </div>
  );
}
```

## Type Repair

The [repairProposal](./repair-proposal.md) function auto-corrects common AI mistakes:

```typescript
// AI produces:
{ type: "input.text" }

// repairProposal fixes to:
{ type: "Input.Text" }
```

## Adding Custom Components

```typescript
// Define component
function MyCustomChart({ bindings, onEvent }: ComponentProps) {
  return <Chart data={bindings?.data} onSelect={onEvent} />;
}

// Register it
ComponentRegistry.register('Display.CustomChart', MyCustomChart);

// Now usable in AppDefinition:
{
  "view": {
    "id": "chart",
    "type": "Display.CustomChart",
    "bindings": { "data": "context.chartData" }
  }
}
```

## Component Categories

### Input Components
Collect user data:
- `Input.Text` - Text input
- `Input.Number` - Numeric input with validation
- `Input.Image` - Image file picker
- `Input.Date` - Date picker
- `Input.Select` - Dropdown selection

### Display Components
Show data:
- `Display.Text` - Static or dynamic text
- `Display.Image` - Image display
- `Display.Chart` - Data visualization
- `Display.Table` - Tabular data
- `Display.Code` - Syntax-highlighted code

### Control Components
Trigger actions:
- `Control.Button` - Clickable button
- `Control.Toggle` - On/off switch
- `Control.Link` - Navigation link

### Layout Components
Structure UI:
- `Layout.Stack` - Vertical stack
- `Layout.Row` - Horizontal row
- `Layout.Grid` - Grid layout
- `Layout.Split` - Resizable split pane

## Relations

- **enables**: [runtime-assembler](./runtime-assembler.md)
- **uses**: [view-tree](./view-tree.md)
- **part-of**: [host-runtime](./host-runtime.md)
- **see-also**: [repair-proposal](./repair-proposal.md)
