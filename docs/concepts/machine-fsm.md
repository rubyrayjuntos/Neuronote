# Machine (Finite State Machine)

> **Facets**: stage: execution | trust: host | domain: state | type: schema

## What is the Machine?

The **Machine** is a finite state machine (FSM) that controls application behavior. It defines states, transitions, and actions in a declarative JSON format.

## Location

Defined in the `machine` property of every [AppDefinition](./app-definition.md).

## Structure

```typescript
interface Machine {
  initial: string;              // Starting state
  states: Record<string, State>;
}

interface State {
  on?: Record<string, Transition>;  // Event handlers
  entry?: string[];                  // Actions on state entry
  exit?: string[];                   // Actions on state exit
}

type Transition = string | {
  target: string;           // Next state
  actions?: string[];       // Actions to execute
  cond?: string;            // Guard condition
};
```

## Example: Counter

```json
{
  "machine": {
    "initial": "idle",
    "states": {
      "idle": {
        "on": {
          "INCREMENT": { "target": "idle", "actions": ["incrementCount"] },
          "DECREMENT": { "target": "idle", "actions": ["decrementCount"] },
          "RESET": { "target": "idle", "actions": ["resetCount"] }
        }
      }
    }
  }
}
```

## Example: Multi-State Workflow

```json
{
  "machine": {
    "initial": "idle",
    "states": {
      "idle": {
        "on": {
          "START": "loading"
        }
      },
      "loading": {
        "entry": ["fetchData"],
        "on": {
          "SUCCESS": "ready",
          "ERROR": "error"
        }
      },
      "ready": {
        "on": {
          "REFRESH": "loading",
          "CLOSE": "idle"
        }
      },
      "error": {
        "on": {
          "RETRY": "loading",
          "DISMISS": "idle"
        }
      }
    }
  }
}
```

## State Diagram

```
         START
   ┌──────────────────┐
   │                  ▼
 ┌─────┐         ┌─────────┐
 │idle │◄────────│ loading │
 └─────┘ DISMISS └────┬────┘
   ▲               │  │
   │ CLOSE    ERROR│  │SUCCESS
   │               ▼  ▼
 ┌─────┐        ┌─────────┐
 │ready│◄───────│  error  │
 └─────┘        └─────────┘
    │      RETRY     ▲
    └────────────────┘
        REFRESH
```

## Shorthand Transitions

For simple state changes without actions:

```json
{
  "on": {
    "CLICK": "nextState"  // Shorthand
  }
}

// Equivalent to:
{
  "on": {
    "CLICK": { "target": "nextState" }
  }
}
```

## Actions

Actions are named functions executed during transitions:

```json
{
  "on": {
    "INCREMENT": { "target": "idle", "actions": ["incrementCount"] }
  }
}
```

Actions modify context:
```typescript
const actions = {
  incrementCount: (context) => ({ ...context, count: context.count + 1 }),
  decrementCount: (context) => ({ ...context, count: context.count - 1 }),
  resetCount: (context) => ({ ...context, count: 0 }),
};
```

## Entry/Exit Actions

Execute actions when entering or leaving a state:

```json
{
  "states": {
    "loading": {
      "entry": ["startSpinner", "fetchData"],
      "exit": ["stopSpinner"],
      "on": {
        "COMPLETE": "ready"
      }
    }
  }
}
```

## Guard Conditions

Conditional transitions (planned feature):

```json
{
  "on": {
    "SUBMIT": {
      "target": "processing",
      "cond": "isFormValid"
    }
  }
}
```

## UI Event Wiring

UI components dispatch events via `onEvent`:

```json
{
  "view": {
    "id": "btn",
    "type": "Control.Button",
    "onEvent": "INCREMENT"
  },
  "machine": {
    "states": {
      "idle": {
        "on": {
          "INCREMENT": { "actions": ["incrementCount"] }
        }
      }
    }
  }
}
```

When the button is clicked:
1. UI dispatches `INCREMENT` event
2. Machine finds handler in current state
3. Actions execute, updating context
4. State transitions (if target differs)
5. UI re-renders with new context

## Runtime Execution

```typescript
// In stores/appStore.ts
transition: (event, payload) => set((state) => {
  const machine = state.appDef.machine;
  const currentState = machine.states[state.machineState];
  const handler = currentState.on?.[event];
  
  if (!handler) return; // Event ignored in this state
  
  const transition = typeof handler === 'string' 
    ? { target: handler } 
    : handler;
  
  // Execute actions
  transition.actions?.forEach(actionName => {
    const action = actions[actionName];
    if (action) {
      state.context = action(state.context, payload);
    }
  });
  
  // Update state
  state.machineState = transition.target || state.machineState;
})
```

## Why FSM?

| Benefit | Explanation |
|---------|-------------|
| **Predictable** | All possible states are explicit |
| **Debuggable** | Current state is always known |
| **Testable** | State transitions are deterministic |
| **AI-friendly** | Declarative format AI can generate |

## Relations

- **part-of**: [app-definition](./app-definition.md)
- **uses**: [zustand-store](./zustand-store.md)
- **enables**: [test-vectors](./test-vectors.md)
- **see-also**: [event-wiring](./event-wiring.md)
