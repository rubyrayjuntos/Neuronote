import { AppDefinition } from "../../types";
import { 
  AIProvider, 
  AIProviderConfig, 
  AIProviderWithCapabilities, 
  ExecutionFeedback, 
  ModelCapabilities 
} from "./types";
import { buildCapabilityPrompt, buildUserPrompt } from "./promptBuilder";
import { isAppDefinition, validateAppDefinition, formatZodErrors, repairProposal, buildRepairFeedback } from "../../schemas";

/**
 * Groq API configuration.
 */
export interface GroqConfig extends AIProviderConfig {
  /** Groq API key */
  apiKey: string;
  /** Model to use (default: gpt-oss-120b - best for JSON schema compliance) */
  modelId?: string;
}

/**
 * Available Groq models (updated Dec 2025)
 * Default: gpt-oss-120b - best at following JSON schema instructions
 */
const GROQ_MODELS = {
  'gpt-oss-120b': {
    modelId: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B (Recommended)',
    contextWindow: 131_072,
  },
  'llama-3.3-70b': {
    modelId: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B',
    contextWindow: 131_072,
  },
  'llama-3.1-8b': {
    modelId: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B',
    contextWindow: 131_072,
  },
  'qwen3-32b': {
    modelId: 'qwen/qwen3-32b',
    name: 'Qwen3 32B',
    contextWindow: 131_072,
  },
};

/**
 * Validates that a parsed object has the minimum required shape of an AppDefinition.
 * Uses Zod schema validation for comprehensive type checking.
 */
const validateAppDefinitionShape = isAppDefinition;

/**
 * Extract JSON from potentially markdown-wrapped response.
 * Handles: markdown code blocks, extra text before/after JSON, nested braces.
 */
function extractJson(text: string): string {
  // First try: markdown code block
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }
  
  // Second try: find balanced braces
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) {
    return text;
  }
  
  // Count braces to find matching closing brace
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  
  for (let i = firstBrace; i < text.length; i++) {
    const char = text[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }
    
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') depth++;
      if (char === '}') {
        depth--;
        if (depth === 0) {
          // Found matching closing brace
          return text.slice(firstBrace, i + 1);
        }
      }
    }
  }
  
  // Fallback: use lastIndexOf (original behavior)
  const lastBrace = text.lastIndexOf('}');
  if (lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  
  return text;
}

/**
 * Groq AI Provider.
 */
export class GroqProvider implements AIProviderWithCapabilities {
  readonly name: string;
  readonly modelId: string;
  readonly capabilities: ModelCapabilities;

  private readonly apiKey: string;

  constructor(config: GroqConfig) {
    if (!config.apiKey) {
      throw new Error("Groq API key required");
    }

    const modelKey = config.modelId || 'gpt-oss-120b';
    const modelConfig = GROQ_MODELS[modelKey as keyof typeof GROQ_MODELS] || GROQ_MODELS['gpt-oss-120b'];

    this.name = `Groq ${modelConfig.name}`;
    this.modelId = modelConfig.modelId;
    this.apiKey = config.apiKey;
    
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
    // Use full operator docs - hybrid mode still causing issues with casing
    const systemPrompt = buildCapabilityPrompt();
    
    // Build user prompt with current def, request, and any feedback
    const userPrompt = buildUserPrompt(
      currentDef,
      prompt,
      feedback ? {
        version: feedback.failedVersion,
        error: feedback.errorMessage,
        failures: feedback.validationFailures
      } : null
    );

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
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[GROQ] API error:', response.status, errorText);
        throw new Error(`Groq API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      // Log token usage
      if (data.usage) {
        console.log('[GROQ] 📊 Token Usage:', {
          prompt_tokens: data.usage.prompt_tokens,
          completion_tokens: data.usage.completion_tokens,
          total_tokens: data.usage.total_tokens
        });
      }
      
      const rawText = data.choices?.[0]?.message?.content;
      if (!rawText) {
        throw new Error("Empty response from Groq");
      }

      console.log('[GROQ] Raw response length:', rawText.length);
      console.log('[GROQ] Raw response (first 500 chars):', rawText.slice(0, 500));
      
      const jsonText = extractJson(rawText);
      console.log('[GROQ] Extracted JSON length:', jsonText.length);
      
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch (parseError) {
        console.error('[GROQ] JSON parse failed.');
        console.error('[GROQ] Raw text:', rawText);
        console.error('[GROQ] Extracted JSON:', jsonText);
        console.error('[GROQ] Error position info:', parseError);
        throw new Error(`AI returned invalid JSON: ${parseError instanceof Error ? parseError.message : 'Parse failed'}`);
      }

      // REPAIR PHASE: Fix common AI mistakes before validation
      const repairResult = repairProposal(parsed);
      if (repairResult.repaired) {
        console.log('[GROQ] 🔧 Applied auto-repairs:', repairResult.fixes);
        parsed = repairResult.proposal;
      }

      // VALIDATION PHASE: Now validate with Zod
      const validationResult = validateAppDefinition(parsed);
      if (!validationResult.success) {
        console.error('[GROQ] Zod validation failed after repair attempt');
        console.error('[GROQ] Zod errors:', formatZodErrors(validationResult.error));
        
        // Build feedback for potential self-correction retry
        const feedbackMsg = buildRepairFeedback(
          validationResult.error.issues,
          repairResult.fixes
        );
        console.error('[GROQ] AI Feedback:\n', feedbackMsg);
        
        throw new Error("AI response missing required fields (version, initialContext, machine, view)");
      }

      console.log('[GROQ] ✅ Proposal validated successfully');
      return parsed as AppDefinition;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Groq Generation Error:`, message);
      throw new Error(`AI Synthesis Failed (Groq): ${message}`);
    }
  }
}

/**
 * Create a Groq provider.
 */
export function createGroqProvider(apiKey?: string, modelId?: string): AIProvider {
  const key = apiKey ?? import.meta.env.VITE_GROQ_API_KEY;
  if (!key) {
    throw new Error("VITE_GROQ_API_KEY not found - required for Groq provider");
  }
  return new GroqProvider({ apiKey: key, modelId });
}
