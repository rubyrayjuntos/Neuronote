import { AppDefinition, ChangeRecord } from "../../types";

/**
 * Execution feedback for AI self-correction.
 * When the AI's previous proposal failed, provide this context
 * so the model can learn from its mistakes.
 */
export interface ExecutionFeedback {
  /** The version that failed */
  failedVersion: string;
  /** What went wrong */
  failureType: 'validation' | 'runtime' | 'rolled_back';
  /** Human-readable error message */
  errorMessage: string;
  /** Specific validation failures if applicable */
  validationFailures?: string[];
  /** The problematic section of the definition */
  problematicSection?: 'view' | 'machine' | 'pipeline' | 'context';
}

/**
 * Configuration for creating an AI provider.
 */
export interface AIProviderConfig {
  /** API key for the provider */
  apiKey: string;
  /** Optional model ID override */
  modelId?: string;
  /** Optional custom system prompt additions */
  systemPromptAdditions?: string;
}

/**
 * Model-agnostic AI provider interface.
 * 
 * All AI providers (Gemini, AWS Bedrock, etc.) implement this interface,
 * allowing the application to swap models without changing business logic.
 * 
 * This is the "Simple Provider Interface" pattern - minimal surface area
 * for maximum flexibility.
 */
export interface AIProvider {
  /** Human-readable provider name (e.g., "Gemini", "Claude via Bedrock") */
  readonly name: string;
  
  /** Model identifier (e.g., "gemini-2.5-flash", "anthropic.claude-3-sonnet") */
  readonly modelId: string;
  
  /**
   * Generate an AppDefinition proposal based on user prompt.
   * 
   * @param currentDef - The current application definition (for context)
   * @param prompt - The user's natural language request
   * @param feedback - Optional execution feedback from previous failed attempt
   * @returns Promise resolving to the proposed AppDefinition
   * @throws Error if generation fails (network, validation, etc.)
   */
  generateProposal(
    currentDef: AppDefinition,
    prompt: string,
    feedback?: ExecutionFeedback | null
  ): Promise<AppDefinition>;
}

/**
 * Extract execution feedback from recent change history.
 * This is provider-agnostic - any AI can use this context for self-correction.
 */
export function extractExecutionFeedback(history: ChangeRecord[]): ExecutionFeedback | null {
  if (history.length === 0) return null;
  
  const latest = history[0];
  
  if (latest.status === 'accepted') {
    return null;  // No failure to report
  }
  
  if (latest.status === 'rejected') {
    const failures = [
      ...latest.verificationReport.checks.structural.filter(c => c.status === 'FAIL').map(c => c.message),
      ...latest.verificationReport.checks.semantic.filter(c => c.status === 'FAIL').map(c => c.message),
      ...latest.verificationReport.checks.honesty.filter(c => c.status === 'FAIL').map(c => c.message),
    ];
    
    return {
      failedVersion: latest.version,
      failureType: 'validation',
      errorMessage: `Proposal rejected with score ${latest.verificationScore}/100`,
      validationFailures: failures.slice(0, 5),  // Cap at 5 to avoid prompt bloat
    };
  }
  
  if (latest.status === 'rolled_back') {
    return {
      failedVersion: latest.version,
      failureType: 'rolled_back',
      errorMessage: latest.failureReason || 'Runtime error caused rollback',
    };
  }
  
  return null;
}

/**
 * Registry of available provider types.
 * Used by the factory function to instantiate providers.
 */
export type ProviderType = 'gemini' | 'groq' | 'bedrock-claude' | 'bedrock-llama' | 'bedrock-mistral';

/**
 * Model capabilities vary - this helps callers understand what to expect.
 * For example, Claude may have better self-correction than Llama.
 */
export interface ModelCapabilities {
  /** Model supports structured JSON output mode */
  structuredOutput: boolean;
  /** Model has strong self-correction (learns from feedback) */
  selfCorrection: 'strong' | 'moderate' | 'weak';
  /** Approximate context window size in tokens */
  contextWindow: number;
  /** Model is optimized for code/JSON generation */
  codeOptimized: boolean;
}

/**
 * Extended provider interface with capability introspection.
 */
export interface AIProviderWithCapabilities extends AIProvider {
  readonly capabilities: ModelCapabilities;
}
/**
 * Options for system prompt generation.
 * Used by SerenaBridge for two-phase "Diner Menu" retrieval.
 */
export interface PromptOptions {
  /** Use abbreviated menu instead of full specs (saves ~90% tokens) */
  useMenu?: boolean;
  /** Specific operators to include full specs for (Phase 2) */
  selectedOperators?: string[];
  /** Relevant categories to filter operators */
  categories?: string[];
}