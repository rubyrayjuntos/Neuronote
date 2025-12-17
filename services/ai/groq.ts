import { AppDefinition } from "../../types";
import { 
  AIProvider, 
  AIProviderConfig, 
  AIProviderWithCapabilities, 
  ExecutionFeedback, 
  ModelCapabilities 
} from "./types";
import { buildSystemPrompt } from "./gemini";

/**
 * Groq API configuration.
 */
export interface GroqConfig extends AIProviderConfig {
  /** Groq API key */
  apiKey: string;
  /** Model to use (default: llama-3.1-70b-versatile) */
  modelId?: string;
}

/**
 * Available Groq models
 */
const GROQ_MODELS = {
  'llama-3.1-70b': {
    modelId: 'llama-3.1-70b-versatile',
    name: 'Llama 3.1 70B',
    contextWindow: 131_072,
  },
  'llama-3.1-8b': {
    modelId: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B',
    contextWindow: 131_072,
  },
  'mixtral-8x7b': {
    modelId: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B',
    contextWindow: 32_768,
  },
  'gemma2-9b': {
    modelId: 'gemma2-9b-it',
    name: 'Gemma 2 9B',
    contextWindow: 8_192,
  },
};

/**
 * Validates that a parsed object has the minimum required shape of an AppDefinition.
 */
function validateAppDefinitionShape(obj: unknown): obj is AppDefinition {
  if (!obj || typeof obj !== 'object') return false;
  const def = obj as Record<string, unknown>;
  
  if (typeof def.version !== 'string') return false;
  if (!def.initialContext || typeof def.initialContext !== 'object') return false;
  if (!def.machine || typeof def.machine !== 'object') return false;
  if (!def.view || typeof def.view !== 'object') return false;
  
  const machine = def.machine as Record<string, unknown>;
  if (typeof machine.initial !== 'string') return false;
  if (!machine.states || typeof machine.states !== 'object') return false;
  
  const view = def.view as Record<string, unknown>;
  if (typeof view.id !== 'string') return false;
  if (typeof view.type !== 'string') return false;
  
  return true;
}

/**
 * Extract JSON from potentially markdown-wrapped response.
 */
function extractJson(text: string): string {
  // Try to extract from markdown code block
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }
  
  // Try to find JSON object directly
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  
  return text;
}

/**
 * Groq AI Provider.
 * 
 * Uses Groq's ultra-fast inference API with Llama 3.1, Mixtral, and other models.
 * Free tier includes generous rate limits.
 * 
 * API Docs: https://console.groq.com/docs/quickstart
 */
export class GroqProvider implements AIProviderWithCapabilities {
  readonly name: string;
  readonly modelId: string;
  readonly capabilities: ModelCapabilities;

  private readonly apiKey: string;
  private readonly systemPromptAdditions?: string;

  constructor(config: GroqConfig) {
    if (!config.apiKey) {
      throw new Error("Groq API key required");
    }

    const modelKey = config.modelId || 'llama-3.1-70b';
    const modelConfig = GROQ_MODELS[modelKey as keyof typeof GROQ_MODELS] || GROQ_MODELS['llama-3.1-70b'];

    this.name = `Groq ${modelConfig.name}`;
    this.modelId = modelConfig.modelId;
    this.apiKey = config.apiKey;
    this.systemPromptAdditions = config.systemPromptAdditions;
    
    this.capabilities = {
      structuredOutput: true,
      selfCorrection: 'moderate',
      contextWindow: modelConfig.contextWindow,
      codeOptimized: true,
    };
  }

  async generateProposal(
    currentDef: AppDefinition,
    prompt: string,
    feedback?: ExecutionFeedback | null
  ): Promise<AppDefinition> {
    const systemPrompt = buildSystemPrompt(currentDef, feedback, this.systemPromptAdditions);
    const userPrompt = `USER REQUEST:\n"${prompt}"\n\nIMPORTANT: Respond with ONLY a complete JSON AppDefinition containing ALL required fields:\n- version (string)\n- initialContext (object)\n- pipelines (object)\n- machine (object with "initial" and "states")\n- view (object with "id", "type", and UI tree)\n- testVectors (array)\n\nNo markdown code blocks, no explanations, just raw JSON.`;

    try {
      console.log('[GROQ] Sending request to', this.modelId);
      
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 8192,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[GROQ] API error:', response.status, errorText);
        throw new Error(`Groq API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      console.log('[GROQ] Response received, usage:', data.usage);
      
      const rawText = data.choices?.[0]?.message?.content;
      if (!rawText) {
        throw new Error("Empty response from Groq");
      }

      console.log('[GROQ] Raw text length:', rawText.length);
      console.log('[GROQ] Raw text (first 500):', rawText.substring(0, 500));
      
      const jsonText = extractJson(rawText);
      console.log('[GROQ] Extracted JSON length:', jsonText.length);

      // Parse with error handling
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch (parseError) {
        console.error('[GROQ] JSON parse failed. Full text:', rawText);
        throw new Error(`AI returned invalid JSON: ${parseError instanceof Error ? parseError.message : 'Parse failed'}`);
      }

      // Validate shape
      if (!validateAppDefinitionShape(parsed)) {
        console.error('[GROQ] Shape validation failed:', parsed);
        throw new Error("AI response missing required fields (version, initialContext, machine, view)");
      }

      console.log('[GROQ] Proposal validated successfully');
      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Groq Generation Error:`, message);
      throw new Error(`AI Synthesis Failed (Groq): ${message}`);
    }
  }
}

/**
 * Create a Groq provider with Llama 3.1 70B (default).
 */
export function createGroqProvider(apiKey?: string, modelId?: string): AIProvider {
  const key = apiKey ?? import.meta.env.VITE_GROQ_API_KEY;
  if (!key) {
    throw new Error("VITE_GROQ_API_KEY not found - required for Groq provider");
  }
  return new GroqProvider({ apiKey: key, modelId });
}
