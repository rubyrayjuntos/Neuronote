# Event Dispatch

> **Facets**: stage: interaction | trust: trusted | domain: state | type: technique

## What is Event Dispatch?

**Event dispatch** is the mechanism by which UI interactions trigger state machine transitions. It's the bridge between user actions and app behavior.

## Flow

```
User Click → Component → dispatch('EVENT') → Store → Machine Transition → State Update → Re-render
```

## Location

- Event wiring: [runtime/RuntimeAssembler.tsx](../../runtime/RuntimeAssembler.tsx)
- State transitions: [stores/appStore.ts](../../stores/appStore.ts)

## Dispatch Function

```typescript
type Dispatch = (event: string, payload?: Record<string, any>) => void;

// Provided via React context
const DispatchContext = createContext<Dispatch>(() => {});

function useDispatch(): Dispatch {
  return useContext(DispatchContext);
}
```

## Component Integration

The RuntimeAssembler wires `onEvent` to dispatch:

```typescript
function renderViewNode(node: ViewNode) {
  const dispatch = useDispatch();
  const Component = componentRegistry.get(node.type);
  
  const handleEvent = (payload?: any) => {
    if (node.onEvent) {
      dispatch(node.onEvent, payload);
    }
  };
  
  return (
    <Component
      onClick={handleEvent}
      onChange={(value) => handleEvent({ value })}
      {...resolvedProps}
    />
  );
}
```

## Event Types

### Simple Events
No payload, just trigger:
```json
{
  "type": "Control.Button",
  "onEvent": "INCREMENT"
}
```
Dispatches: `{ type: "INCREMENT" }`

### Events with Payload
Include data from the interaction:
```json
{
  "type": "Input.Image",
  "onEvent": "FILE_SELECTED"
}
```
Dispatches: `{ type: "FILE_SELECTED", file: File, dataUrl: "..." }`

## Machine Handling

The store processes events through the machine:

```typescript
transition: (event, payload) => set((state) => {
  const machine = state.appDef.machine;
  const currentState = machine.states[state.machineState];
  const handler = currentState.on?.[event];
  
  if (!handler) {
    console.warn(`No handler for ${event} in state ${state.machineState}`);
    return;
  }
  
  const transition = typeof handler === 'string' 
    ? { target: handler } 
    : handler;
  
  // Execute actions
  transition.actions?.forEach(actionName => {
    const action = actionRegistry[actionName];
    if (action) {
      state.context = action(state.context, payload);
    }
  });
  
  // Update machine state
  state.machineState = transition.target || state.machineState;
})
```

## Common Event Patterns

### Click Counter
```json
{
  "machine": {
    "states": {
      "idle": {
        "on": {
          "INCREMENT": { "actions": ["addOne"] },
          "DECREMENT": { "actions": ["subtractOne"] }
        }
      }
    }
  }
}
```

### Form Submission
```json
{
  "machine": {
    "states": {
      "editing": {
        "on": {
          "SUBMIT": { "target": "submitting" },
          "CANCEL": { "target": "idle" }
        }
      },
      "submitting": {
        "entry": ["sendForm"],
        "on": {
          "SUCCESS": "done",
          "ERROR": "editing"
        }
      }
    }
  }
}
```

### File Upload
```json
{
  "machine": {
    "states": {
      "idle": {
        "on": {
          "FILE_SELECTED": { 
            "target": "processing",
            "actions": ["storeFile"]
          }
        }
      }
    }
  }
}
```

## Debugging

Events are logged for debugging:

```typescript
dispatch: (event, payload) => {
  console.log(`[Dispatch] ${event}`, payload);
  // ... handle event
}
```

## Validation

The [semantic-checks](./semantic-checks.md) verify:
- Every `onEvent` in view tree has a handler in some state
- No orphan events that are never triggered

## Relations

- **requires**: [machine-fsm](./machine-fsm.md)
- **enables**: [pipelines](./pipelines.md) (via actions)
- **uses**: [zustand-store](./zustand-store.md)
- **see-also**: [context-binding](./context-binding.md)
