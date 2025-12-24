# AI Provider Abstraction

> **Facets**: stage: proposal | trust: untrusted | domain: intelligence | type: component

## What is the AI Provider Abstraction?

The **AI Provider Abstraction** is a unified interface for multiple LLM backends. It allows NeuroNote to work with Groq, Gemini, Bedrock, or any future provider through a common API.

## Location

- Interface: [services/ai/types.ts](../../services/ai/types.ts)
- Implementations: [services/ai/groq.ts](../../services/ai/groq.ts), [services/ai/gemini.ts](../../services/ai/gemini.ts), [services/ai/bedrock.ts](../../services/ai/bedrock.ts)
- Factory: [services/ai/index.ts](../../services/ai/index.ts)

## Interface

```typescript
interface AIProvider {
  generateProposal(
    userPrompt: string,
    options?: GenerationOptions
  ): Promise<AppDefinition>;
}

interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  useMenu?: boolean;           // Use abbreviated operator menu
  featuredOperators?: string[]; // Operators to include with full specs
}
```

## Provider Implementations

### Groq
```typescript
// services/ai/groq.ts
export async function generateProposal(
  userPrompt: string,
  options?: GenerationOptions
): Promise<AppDefinition> {
  const systemPrompt = buildSystemPrompt(options);
  
  const response = await fetch('https://api.groq.com/...', {
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.1-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: options?.temperature ?? 0.7,
    })
  });
  
  const json = await response.json();
  return parseAndValidate(json.choices[0].message.content);
}
```

### Gemini
```typescript
// services/ai/gemini.ts
export async function generateProposal(
  userPrompt: string,
  options?: GenerationOptions
): Promise<AppDefinition> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent`,
    {
      headers: { 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(userPrompt, options) }] }]
      })
    }
  );
  
  const json = await response.json();
  return parseAndValidate(json.candidates[0].content.parts[0].text);
}
```

### Bedrock
```typescript
// services/ai/bedrock.ts
export async function generateProposal(
  userPrompt: string,
  options?: GenerationOptions
): Promise<AppDefinition> {
  // Uses AWS SDK or REST API with IAM auth
  const response = await bedrockClient.invokeModel({
    modelId: 'anthropic.claude-3-sonnet',
    body: JSON.stringify({
      prompt: buildPrompt(userPrompt, options),
      max_tokens: options?.maxTokens ?? 4096,
    })
  });
  
  return parseAndValidate(response.body);
}
```

## Factory Pattern

```typescript
// services/ai/index.ts
type ProviderType = 'groq' | 'gemini' | 'bedrock';

export function getProvider(type: ProviderType): AIProvider {
  switch (type) {
    case 'groq': return groqProvider;
    case 'gemini': return geminiProvider;
    case 'bedrock': return bedrockProvider;
    default: throw new Error(`Unknown provider: ${type}`);
  }
}
```

## Common Processing

All providers share post-processing:

```typescript
async function parseAndValidate(rawResponse: string): Promise<AppDefinition> {
  // 1. Extract JSON from response
  const json = extractJSON(rawResponse);
  
  // 2. Auto-repair common mistakes
  const repaired = repairProposal(json);
  
  // 3. Validate with Zod
  const parsed = AppDefinitionSchema.parse(repaired);
  
  // 4. Semantic verification
  const result = verifyProposal(parsed);
  if (!result.valid) {
    throw new ValidationError(result.errors);
  }
  
  return parsed;
}
```

## Environment Configuration

```bash
# .env
VITE_GROQ_API_KEY=gsk_...
VITE_API_KEY=AIza...        # Gemini
# Bedrock uses IAM or bearer token
```

## Token Usage Tracking

Each provider logs token usage:

```typescript
const response = await fetch(...);
const json = await response.json();

console.log('Token usage:', {
  prompt_tokens: json.usage?.prompt_tokens,
  completion_tokens: json.usage?.completion_tokens,
  total_tokens: json.usage?.total_tokens,
});
```

## Error Handling

Providers handle common failure modes:

```typescript
try {
  return await generateProposal(prompt);
} catch (error) {
  if (error.status === 429) {
    throw new RateLimitError('Too many requests');
  }
  if (error.status === 401) {
    throw new AuthError('Invalid API key');
  }
  throw error;
}
```

## Relations

- **uses**: [prompt-builder](./prompt-builder.md)
- **enables**: [app-definition](./app-definition.md)
- **see-also**: [serena-bridge](./serena-bridge.md)
