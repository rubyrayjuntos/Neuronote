# SerenaBridge

> **Facets**: stage: proposal | trust: boundary | domain: ai | type: component

## What is SerenaBridge?

**SerenaBridge** is the token-efficient interface between NeuroNote and AI coding agents. It provides operator specifications to AI in two modes: abbreviated "menu" mode and detailed "specs" mode.

## Location

[services/SerenaBridge.ts](../../services/SerenaBridge.ts)

## Problem: Token Limits

AI models have context limits. Sending full documentation for 45+ operators wastes tokens:
- Full specs: ~20,000 tokens
- Menu mode: ~2,000 tokens

SerenaBridge enables **progressive disclosure**: start with a menu, expand on demand.

## Two-Phase Protocol

### Phase 1: Menu Mode

Send abbreviated operator signatures:

```typescript
const menu = SerenaBridge.buildMenuPrompt();

// Output:
// Available Operators:
// Math.Add(a: number, b: number) → number
// Math.Subtract(a: number, b: number) → number
// Image.Grayscale(image: image) → image
// Image.Blur(image: image, radius: number) → image
// Text.Template(template: string, vars: object) → string
// ...
```

### Phase 2: Specs Mode

When AI needs details for specific operators:

```typescript
const specs = SerenaBridge.buildSpecsPrompt(['Math.Add', 'Image.Blur']);

// Output:
// ## Math.Add
// Category: math
// Tier: 1 (WASM sandboxed)
// 
// Inputs:
//   - a: number (required) - First operand
//   - b: number (required) - Second operand
// 
// Output: number
// 
// Description: Adds two numbers together.
// 
// Example:
// {
//   "id": "sum",
//   "op": "Math.Add",
//   "inputs": { "a": "$x", "b": "$y" }
// }
// ...
```

## API

```typescript
class SerenaBridge {
  // Get all operators in abbreviated form
  static buildMenuPrompt(): string;
  
  // Get full specs for specific operators
  static buildSpecsPrompt(operators: string[]): string;
  
  // Hybrid: featured operators get full specs, others get menu
  static buildHybridPrompt(options: {
    featuredOperators?: string[];
    includeTier?: 1 | 2 | 'all';
  }): string;
}
```

## Hybrid Mode

For common workflows, send full specs for likely-needed operators:

```typescript
const prompt = SerenaBridge.buildHybridPrompt({
  featuredOperators: ['Math.Add', 'Math.Subtract', 'Text.Template'],
  includeTier: 1  // Only Tier 1 in menu (security)
});
```

## Integration with AI Providers

```typescript
// In services/ai/groq.ts
async function generateProposal(userPrompt: string): Promise<AppDefinition> {
  const systemPrompt = `
You are an AI assistant generating NeuroNote app definitions.

${SerenaBridge.buildMenuPrompt()}

If you need more details about specific operators, ask for them.
  `;
  
  const response = await groq.chat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });
  
  return parseProposal(response);
}
```

## Implementation

```typescript
// In SerenaBridge.ts
import { operatorRegistry } from '../operators/registry';

export class SerenaBridge {
  static buildMenuPrompt(): string {
    const lines = ['# Available Operators\n'];
    
    for (const [op, def] of operatorRegistry) {
      const inputs = def.inputs
        .map(i => `${i.name}: ${i.type}`)
        .join(', ');
      lines.push(`${op}(${inputs}) → ${def.output.type}`);
    }
    
    return lines.join('\n');
  }
  
  static buildSpecsPrompt(operators: string[]): string {
    const sections = operators.map(opName => {
      const def = operatorRegistry.get(opName);
      if (!def) return `## ${opName}\nUnknown operator`;
      
      return `
## ${opName}

Category: ${def.category}
Tier: ${def.tier} (${def.tier === 1 ? 'WASM sandboxed' : 'Host only'})
Pure: ${def.pure}
Async: ${def.async}

### Inputs
${def.inputs.map(i => `- ${i.name}: ${i.type} - ${i.description}`).join('\n')}

### Output
${def.output.type} - ${def.output.description}

### Description
${def.description}
      `.trim();
    });
    
    return sections.join('\n\n---\n\n');
  }
}
```

## Token Efficiency

| Mode | Tokens | Use Case |
|------|--------|----------|
| Full specs | ~20,000 | Documentation, debugging |
| Menu only | ~2,000 | Initial prompt, simple tasks |
| Hybrid | ~5,000 | Complex tasks with known operators |

## Error Handling

When AI requests unknown operators:

```typescript
static buildSpecsPrompt(operators: string[]): string {
  const unknown = operators.filter(op => !operatorRegistry.has(op));
  
  if (unknown.length > 0) {
    return `Unknown operators: ${unknown.join(', ')}\n\n` +
           `Available operators:\n${this.buildMenuPrompt()}`;
  }
  
  // ... normal spec generation
}
```

## Relations

- **uses**: [operator-registry](./operator-registry.md)
- **enables**: [ai-proposal-format](./ai-proposal-format.md)
- **part-of**: [proposal-generation](./proposal-generation.md)
- **see-also**: [prompt-builder](./prompt-builder.md)
