import { AppDefinition } from "../../types";
import { 
  AIProvider, 
  AIProviderConfig, 
  AIProviderWithCapabilities, 
  ExecutionFeedback, 
  ModelCapabilities,
  ProviderType 
} from "./types";
import { buildSystemPrompt } from "./gemini";

/**
 * AWS Bedrock configuration.
 * Supports two authentication methods:
 * 1. Bearer Token (simpler, from Bedrock console)
 * 2. IAM credentials (accessKeyId + secretAccessKey)
 */
export interface BedrockConfig extends AIProviderConfig {
  /** AWS region (e.g., "us-east-1") */
  region?: string;
  /** Bearer token from Bedrock console (preferred for browser) */
  bearerToken?: string;
  /** AWS access key ID (alternative to bearer token) */
  accessKeyId?: string;
  /** AWS secret access key (alternative to bearer token) */
  secretAccessKey?: string;
}

/**
 * Model-specific configurations for Bedrock.
 */
const BEDROCK_MODELS: Record<string, {
  modelId: string;
  name: string;
  capabilities: ModelCapabilities;
  formatRequest: (systemPrompt: string, userPrompt: string) => unknown;
  parseResponse: (body: unknown) => string;
}> = {
  'bedrock-claude': {
    modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
    name: 'Claude 3 Sonnet via Bedrock',
    capabilities: {
      structuredOutput: true,
      selfCorrection: 'strong',  // Claude excels at learning from feedback
      contextWindow: 200_000,
      codeOptimized: true,
    },
    formatRequest: (systemPrompt: string, userPrompt: string) => ({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt }
      ]
    }),
    parseResponse: (body: unknown) => {
      const resp = body as { content?: Array<{ text?: string }> };
      const text = resp.content?.[0]?.text;
      if (!text) throw new Error("Empty response from Claude");
      return text;
    }
  },
  'bedrock-llama': {
    modelId: 'meta.llama3-70b-instruct-v1:0',
    name: 'Llama 3 70B via Bedrock',
    capabilities: {
      structuredOutput: false,  // Llama needs prompting for JSON
      selfCorrection: 'moderate',
      contextWindow: 8_000,
      codeOptimized: false,
    },
    formatRequest: (systemPrompt: string, userPrompt: string) => ({
      prompt: `<|begin_of_text|><|start_header_id|>system<|end_header_id|>

${systemPrompt}<|eot_id|><|start_header_id|>user<|end_header_id|>

${userPrompt}

Respond with ONLY the JSON AppDefinition, no explanations.<|eot_id|><|start_header_id|>assistant<|end_header_id|>

{`,
      max_gen_len: 8192,
      temperature: 0.1,
    }),
    parseResponse: (body: unknown) => {
      const resp = body as { generation?: string };
      const text = resp.generation;
      if (!text) throw new Error("Empty response from Llama");
      // Llama might not include the opening brace we prompted with
      return text.startsWith('{') ? text : '{' + text;
    }
  },
  'bedrock-mistral': {
    modelId: 'mistral.mistral-large-2402-v1:0',
    name: 'Mistral Large via Bedrock',
    capabilities: {
      structuredOutput: true,
      selfCorrection: 'moderate',
      contextWindow: 32_000,
      codeOptimized: true,
    },
    formatRequest: (systemPrompt: string, userPrompt: string) => ({
      prompt: `<s>[INST] ${systemPrompt}\n\n${userPrompt}\n\nRespond with ONLY the JSON AppDefinition. [/INST]`,
      max_tokens: 8192,
      temperature: 0.1,
    }),
    parseResponse: (body: unknown) => {
      const resp = body as { outputs?: Array<{ text?: string }> };
      const text = resp.outputs?.[0]?.text;
      if (!text) throw new Error("Empty response from Mistral");
      return text;
    }
  }
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
 * AWS Bedrock AI Provider.
 * 
 * Supports multiple foundation models through Amazon Bedrock:
 * - Claude (Anthropic) - Best for self-correction
 * - Llama (Meta) - Good for general tasks
 * - Mistral - Good for code generation
 * 
 * Note: Requires AWS SDK. Install with: npm install @aws-sdk/client-bedrock-runtime
 */
export class BedrockProvider implements AIProviderWithCapabilities {
  readonly name: string;
  readonly modelId: string;
  readonly capabilities: ModelCapabilities;

  private readonly config: BedrockConfig;
  private readonly modelConfig: typeof BEDROCK_MODELS[string];
  private readonly systemPromptAdditions?: string;

  constructor(providerType: ProviderType, config: BedrockConfig) {
    const modelConfig = BEDROCK_MODELS[providerType];
    if (!modelConfig) {
      throw new Error(`Unknown Bedrock provider type: ${providerType}`);
    }

    this.modelConfig = modelConfig;
    this.name = modelConfig.name;
    this.modelId = config.modelId ?? modelConfig.modelId;
    this.capabilities = modelConfig.capabilities;
    this.config = {
      ...config,
      region: config.region ?? process.env.AWS_REGION ?? 'us-east-1',
    };
    this.systemPromptAdditions = config.systemPromptAdditions;
  }

  async generateProposal(
    currentDef: AppDefinition,
    prompt: string,
    feedback?: ExecutionFeedback | null
  ): Promise<AppDefinition> {
    const systemPrompt = buildSystemPrompt(currentDef, feedback, this.systemPromptAdditions);
    
    // Simple user prompt with delimiter (matching system prompt format)
    const userPrompt = `<<<USER_REQUEST>>>
${prompt}
<<<END_USER_REQUEST>>>`;
    const requestBody = this.modelConfig.formatRequest(systemPrompt, userPrompt);
    
    console.log('[BEDROCK] System prompt length:', systemPrompt.length);

    try {
      let responseBody: unknown;

      // Use bearer token if available (simpler, browser-friendly)
      if (this.config.bearerToken) {
        console.log('[BEDROCK] Using bearer token auth');
        responseBody = await this.invokeWithBearerToken(requestBody);
      } else {
        console.log('[BEDROCK] Using SDK auth');
        responseBody = await this.invokeWithSdk(requestBody);
      }

      console.log('[BEDROCK] Raw response body:', responseBody);
      
      const rawText = this.modelConfig.parseResponse(responseBody);
      console.log('[BEDROCK] Full extracted text length:', rawText.length);
      console.log('[BEDROCK] Extracted text (first 1000 chars):', rawText.substring(0, 1000));
      console.log('[BEDROCK] Extracted text (last 500 chars):', rawText.substring(rawText.length - 500));
      
      const jsonText = extractJson(rawText);
      console.log('[BEDROCK] Extracted JSON length:', jsonText.length);

      // Parse with error handling
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch (parseError) {
        console.error('[BEDROCK] JSON parse failed. Full text:', rawText);
        throw new Error(`AI returned invalid JSON: ${parseError instanceof Error ? parseError.message : 'Parse failed'}`);
      }

      // Validate shape
      if (!validateAppDefinitionShape(parsed)) {
        console.error('[BEDROCK] Shape validation failed:', parsed);
        throw new Error("AI response missing required fields (version, initialContext, machine, view)");
      }

      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Bedrock (${this.name}) Generation Error:`, message);
      throw new Error(`AI Synthesis Failed (${this.name}): ${message}`);
    }
  }

  /**
   * Invoke Bedrock using Bearer Token (API Key from Bedrock console).
   * This is simpler and works directly in browser without AWS SDK complexity.
   */
  private async invokeWithBearerToken(requestBody: unknown): Promise<unknown> {
    const region = this.config.region || 'us-east-1';
    const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(this.modelId)}/invoke`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.config.bearerToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bedrock API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Invoke Bedrock using AWS SDK with IAM credentials.
   * Requires @aws-sdk/client-bedrock-runtime package.
   */
  private async invokeWithSdk(requestBody: unknown): Promise<unknown> {
    const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');

    const client = new BedrockRuntimeClient({
      region: this.config.region,
      credentials: this.config.accessKeyId && this.config.secretAccessKey
        ? {
            accessKeyId: this.config.accessKeyId,
            secretAccessKey: this.config.secretAccessKey,
          }
        : undefined,
    });

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const response = await client.send(command);
    
    if (!response.body) {
      throw new Error("Bedrock returned empty response");
    }

    return JSON.parse(new TextDecoder().decode(response.body));
  }
}

/**
 * Create a Bedrock Claude provider.
 */
export function createBedrockClaudeProvider(config?: Partial<BedrockConfig>): AIProvider {
  return new BedrockProvider('bedrock-claude', {
    apiKey: '',  // Bedrock uses AWS credentials, not API key
    ...config,
  });
}

/**
 * Create a Bedrock Llama provider.
 */
export function createBedrockLlamaProvider(config?: Partial<BedrockConfig>): AIProvider {
  return new BedrockProvider('bedrock-llama', {
    apiKey: '',
    ...config,
  });
}

/**
 * Create a Bedrock Mistral provider.
 */
export function createBedrockMistralProvider(config?: Partial<BedrockConfig>): AIProvider {
  return new BedrockProvider('bedrock-mistral', {
    apiKey: '',
    ...config,
  });
}
