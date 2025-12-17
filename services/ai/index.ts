/**
 * AI Provider Factory and Exports
 * 
 * This module provides a unified interface for creating AI providers.
 * The application can switch between providers (Gemini, Claude, Llama, Mistral)
 * without changing business logic.
 * 
 * Usage:
 *   import { createProvider, AIProvider } from './services/ai';
 *   const ai = createProvider('gemini');
 *   const proposal = await ai.generateProposal(currentDef, userPrompt, feedback);
 */

// Re-export types
export type { 
  AIProvider, 
  AIProviderConfig,
  AIProviderWithCapabilities,
  ExecutionFeedback,
  ModelCapabilities,
  ProviderType 
} from './types';

export { extractExecutionFeedback } from './types';

// Re-export providers
export { GeminiProvider, createGeminiProvider, buildSystemPrompt } from './gemini';
export { BedrockProvider, createBedrockClaudeProvider, createBedrockLlamaProvider, createBedrockMistralProvider } from './bedrock';
export { GroqProvider, createGroqProvider } from './groq';
export type { BedrockConfig } from './bedrock';
export type { GroqConfig } from './groq';

import { AIProvider, ProviderType, AIProviderConfig } from './types';
import { createGeminiProvider, GeminiProvider } from './gemini';
import { BedrockProvider, BedrockConfig } from './bedrock';
import { GroqProvider, GroqConfig } from './groq';

/**
 * Factory function to create an AI provider by type.
 * 
 * @param type - The provider type ('gemini', 'bedrock-claude', 'bedrock-llama', 'bedrock-mistral')
 * @param config - Optional configuration (API keys, model overrides, etc.)
 * @returns An AIProvider instance
 * 
 * @example
 * // Using Gemini (default)
 * const ai = createProvider('gemini');
 * 
 * @example
 * // Using Claude via AWS Bedrock
 * const ai = createProvider('bedrock-claude', { region: 'us-west-2' });
 * 
 * @example
 * // Using a specific Gemini model
 * const ai = createProvider('gemini', { modelId: 'gemini-2.5-flash' });
 */
export function createProvider(
  type: ProviderType,
  config?: Partial<AIProviderConfig & BedrockConfig>
): AIProvider {
  switch (type) {
    case 'gemini': {
      const apiKey = config?.apiKey ?? import.meta.env.VITE_API_KEY;
      if (!apiKey) {
        throw new Error("VITE_API_KEY required for Gemini provider");
      }
      return new GeminiProvider({ 
        apiKey,
        modelId: config?.modelId,
        systemPromptAdditions: config?.systemPromptAdditions,
      });
    }

    case 'bedrock-claude':
    case 'bedrock-llama':
    case 'bedrock-mistral': {
      // Get AWS credentials from config or environment variables
      // Bearer token is preferred (simpler, from Bedrock console)
      const bearerToken = config?.bearerToken ?? import.meta.env.VITE_AWS_BEARER_TOKEN;
      const accessKeyId = config?.accessKeyId ?? import.meta.env.VITE_AWS_ACCESS_KEY_ID;
      const secretAccessKey = config?.secretAccessKey ?? import.meta.env.VITE_AWS_SECRET_ACCESS_KEY;
      const region = config?.region ?? import.meta.env.VITE_AWS_REGION ?? 'us-east-1';
      
      // Require either bearer token OR IAM credentials
      if (!bearerToken && (!accessKeyId || !secretAccessKey)) {
        throw new Error('AWS auth required for Bedrock. Set VITE_AWS_BEARER_TOKEN or (VITE_AWS_ACCESS_KEY_ID + VITE_AWS_SECRET_ACCESS_KEY)');
      }
      
      return new BedrockProvider(type, {
        apiKey: '',  // Bedrock uses AWS auth, not API key
        region,
        bearerToken,
        accessKeyId,
        secretAccessKey,
        modelId: config?.modelId,
        systemPromptAdditions: config?.systemPromptAdditions,
      });
    }

    case 'groq': {
      const apiKey = config?.apiKey ?? import.meta.env.VITE_GROQ_API_KEY;
      if (!apiKey) {
        throw new Error('VITE_GROQ_API_KEY required for Groq provider');
      }
      return new GroqProvider({
        apiKey,
        modelId: config?.modelId,
        systemPromptAdditions: config?.systemPromptAdditions,
      });
    }

    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

/**
 * Get the default provider based on environment configuration.
 * 
 * Checks for provider configuration in this order:
 * 1. VITE_AI_PROVIDER env var (e.g., "gemini", "bedrock-claude")
 * 2. Falls back to 'gemini' if VITE_API_KEY is set
 * 3. Falls back to 'bedrock-claude' if AWS credentials are available
 */
export function getDefaultProvider(): AIProvider {
  const providerType = import.meta.env.VITE_AI_PROVIDER as ProviderType | undefined;
  
  if (providerType) {
    return createProvider(providerType);
  }
  
  // Default to Gemini if API_KEY is available
  if (import.meta.env.VITE_API_KEY) {
    return createProvider('gemini');
  }
  
  // Try Groq if API key is available (free tier)
  if (import.meta.env.VITE_GROQ_API_KEY) {
    return createProvider('groq');
  }
  
  // Try Bedrock Claude as fallback if AWS auth is available
  if (import.meta.env.VITE_AWS_BEARER_TOKEN || 
      (import.meta.env.VITE_AWS_ACCESS_KEY_ID && import.meta.env.VITE_AWS_SECRET_ACCESS_KEY)) {
    return createProvider('bedrock-claude');
  }
  
  throw new Error(
    "No AI provider configured. Set VITE_GROQ_API_KEY for Groq (free), VITE_API_KEY for Gemini, or AWS credentials for Bedrock."
  );
}

/**
 * List of all available provider types with their descriptions.
 * Useful for UI provider selection.
 */
export const AVAILABLE_PROVIDERS: Array<{
  type: ProviderType;
  name: string;
  description: string;
  requiresApiKey: boolean;
  requiresAws: boolean;
}> = [
  {
    type: 'groq',
    name: 'Groq (Free)',
    description: 'Llama 3.1 70B - Ultra-fast, free tier available',
    requiresApiKey: true,
    requiresAws: false,
  },
  {
    type: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini 2.5 Flash - Fast, structured JSON output',
    requiresApiKey: true,
    requiresAws: false,
  },
  {
    type: 'bedrock-claude',
    name: 'Claude (via AWS Bedrock)',
    description: 'Claude 3 Sonnet - Strong self-correction, large context',
    requiresApiKey: false,
    requiresAws: true,
  },
  {
    type: 'bedrock-llama',
    name: 'Llama 3 (via AWS Bedrock)',
    description: 'Llama 3 70B - Open weights, general purpose',
    requiresApiKey: false,
    requiresAws: true,
  },
  {
    type: 'bedrock-mistral',
    name: 'Mistral Large (via AWS Bedrock)',
    description: 'Mistral Large - Code optimized, efficient',
    requiresApiKey: false,
    requiresAws: true,
  },
];
