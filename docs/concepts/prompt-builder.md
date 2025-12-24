# Prompt Builder

> **Facets**: stage: proposal | trust: trusted | domain: intelligence | type: component

## What is the Prompt Builder?

The **Prompt Builder** constructs system prompts for AI providers. It assembles schema documentation, operator specs, and examples into prompts that guide AI to generate valid AppDefinitions.

## Location

[services/ai/promptBuilder.ts](../../services/ai/promptBuilder.ts)

## Responsibilities

1. **Schema documentation**: Explain AppDefinition structure
2. **Operator catalog**: List available operators (via SerenaBridge)
3. **Examples**: Provide valid proposal examples
4. **Constraints**: Specify validation rules
5. **Response format**: Request JSON output

## System Prompt Structure

```
┌─────────────────────────────────────────────────┐
│ 1. Role Definition                              │
│    "You are an AI generating NeuroNote apps..." │
├─────────────────────────────────────────────────┤
│ 2. Schema Overview                              │
│    AppDefinition structure, required fields     │
├─────────────────────────────────────────────────┤
│ 3. Operator Catalog (via SerenaBridge)          │
│    Menu mode or full specs                      │
├─────────────────────────────────────────────────┤
│ 4. Component Types                              │
│    Available UI components                       │
├─────────────────────────────────────────────────┤
│ 5. Examples                                     │
│    Valid AppDefinition samples                  │
├─────────────────────────────────────────────────┤
│ 6. Critical Rules                               │
│    Common mistakes to avoid                     │
└─────────────────────────────────────────────────┘
```

## Implementation

```typescript
export function buildSystemPrompt(options?: PromptOptions): string {
  const parts: string[] = [];
  
  // 1. Role
  parts.push(`
You are an AI assistant that generates NeuroNote application definitions.
Your output must be valid JSON matching the AppDefinition schema.
  `);
  
  // 2. Schema
  parts.push(`
## AppDefinition Schema

{
  "version": "string (timestamp)",
  "initialContext": { key: value pairs },
  "machine": { initial, states },
  "pipelines": { pipelineId: { inputs, nodes, output } },
  "view": { id, type, children, bindings },
  "testVectors": [{ name, steps }]
}
  `);
  
  // 3. Operators (via SerenaBridge)
  if (options?.featuredOperators) {
    parts.push(SerenaBridge.buildHybridPrompt({
      featuredOperators: options.featuredOperators
    }));
  } else if (options?.useMenu) {
    parts.push(SerenaBridge.buildMenuPrompt());
  } else {
    parts.push(SerenaBridge.buildFullPrompt());
  }
  
  // 4. Components
  parts.push(`
## Available Components

Control: Button, Slider, Toggle, Dropdown
Input: Text, Image, File, Number
Display: Text, Chart, Image, Table
Layout: Stack, Grid, Row, Column
  `);
  
  // 5. Example
  parts.push(`
## Example: Counter App

${JSON.stringify(COUNTER_EXAMPLE, null, 2)}
  `);
  
  // 6. Rules
  parts.push(`
## Critical Rules

1. Component types use PascalCase: "Control.Button", not "control.button"
2. Every $variable in pipeline inputs must be declared
3. Every onEvent must have a handler in the machine
4. Output JSON only, no markdown code blocks
  `);
  
  return parts.join('\n\n');
}
```

## Token Optimization

The prompt builder balances completeness with token efficiency:

| Mode | Tokens | Use Case |
|------|--------|----------|
| Full docs | ~20,000 | Initial development |
| Menu + examples | ~5,000 | Production |
| Minimal | ~2,000 | Simple requests |

```typescript
// Adaptive prompt based on request complexity
function buildAdaptivePrompt(userPrompt: string): string {
  const complexity = analyzeComplexity(userPrompt);
  
  if (complexity === 'simple') {
    return buildMinimalPrompt();
  } else if (complexity === 'standard') {
    return buildSystemPrompt({ useMenu: true });
  } else {
    return buildSystemPrompt({ useMenu: false }); // Full docs
  }
}
```

## Example Templates

```typescript
const COUNTER_EXAMPLE: AppDefinition = {
  version: "v2025-12-23",
  initialContext: { count: 0 },
  machine: {
    initial: "idle",
    states: {
      idle: {
        on: {
          INCREMENT: { actions: ["addOne"] },
          DECREMENT: { actions: ["subtractOne"] }
        }
      }
    }
  },
  pipelines: {},
  view: {
    id: "root",
    type: "Layout.Stack",
    children: [
      { id: "display", type: "Display.Text", bindings: { text: "context.count" } },
      { id: "inc", type: "Control.Button", bindings: { label: "'+'" }, onEvent: "INCREMENT" }
    ]
  },
  testVectors: [{
    name: "Counter increments",
    initialState: "idle",
    steps: [{ event: "INCREMENT", expectContextKeys: { count: 1 } }]
  }]
};
```

## Relations

- **uses**: [serena-bridge](./serena-bridge.md)
- **uses**: [operator-registry](./operator-registry.md)
- **enables**: [ai-provider](./ai-provider.md)
- **see-also**: [app-definition](./app-definition.md)
