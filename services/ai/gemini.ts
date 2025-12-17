import { GoogleGenAI } from "@google/genai";
import { AppDefinition } from "../../types";
import { AIProvider, AIProviderConfig, AIProviderWithCapabilities, ExecutionFeedback, ModelCapabilities } from "./types";
import { generateOperatorDocs } from "../../operators";

/**
 * Validates that a parsed object has the minimum required shape of an AppDefinition.
 * This is a runtime guard since AI output cannot be trusted.
 */
function validateAppDefinitionShape(obj: unknown): obj is AppDefinition {
  if (!obj || typeof obj !== 'object') return false;
  const def = obj as Record<string, unknown>;
  
  // Required fields
  if (typeof def.version !== 'string') return false;
  if (!def.initialContext || typeof def.initialContext !== 'object') return false;
  if (!def.machine || typeof def.machine !== 'object') return false;
  if (!def.view || typeof def.view !== 'object') return false;
  
  // Machine must have initial state and states object
  const machine = def.machine as Record<string, unknown>;
  if (typeof machine.initial !== 'string') return false;
  if (!machine.states || typeof machine.states !== 'object') return false;
  
  // View must have id and type
  const view = def.view as Record<string, unknown>;
  if (typeof view.id !== 'string') return false;
  if (typeof view.type !== 'string') return false;
  
  return true;
}

/**
 * Build the system instruction prompt for NeuroNote.
 * This is shared across providers but can be customized.
 */
export function buildSystemPrompt(
  currentDef: AppDefinition,
  feedback?: ExecutionFeedback | null,
  additions?: string
): string {
  // Build feedback section if previous attempt failed
  const feedbackSection = feedback ? `
PREVIOUS ATTEMPT FAILED:
⚠️ Your last proposal (${feedback.failedVersion}) was ${feedback.failureType === 'rolled_back' ? 'accepted but caused a runtime error and was rolled back' : 'rejected by the Gatekeeper'}.
Error: ${feedback.errorMessage}
${feedback.validationFailures && feedback.validationFailures.length > 0 ? `
Specific failures:
${feedback.validationFailures.map(f => `  - ${f}`).join('\n')}
` : ''}
INSTRUCTION: Analyze the failure and fix the issue in your next proposal. Do NOT repeat the same mistake.
` : '';

  const customAdditions = additions ? `\n${additions}\n` : '';

  return `
You are the Guest Scientist for NeuroNote.
Your goal: Architect "Dataflow Tools" by composing verified primitives.
You DO NOT write code. You define JSON schemas (Graphs) that the Host executes.

CRITICAL: You must provide 'testVectors' to prove your logic works before I execute it.
${feedbackSection}
${customAdditions}

OUTPUT INTERFACE:
interface AppDefinition {
  version: string;
  initialContext: Record<string, any>;
  pipelines: Record<string, PipelineDefinition>; // Registry of Computation Graphs
  machine: MachineDefinition; 
  view: ViewNode;
  testVectors: TestVector[]; 
}

interface PipelineDefinition {
  inputs: Record<string, DataType>; // REQUIRED: Declare expected context inputs with types
  nodes: { 
     id: string; 
     op: string; 
     inputs: Record<string, string | number | boolean>; // "$var", "@nodeId", or literal
  }[];
  output: string; // ID of the node returning result
  budget?: { maxOps: number; maxTimeMs: number }; // Optional resource limits
}

type DataType = 'string' | 'number' | 'boolean' | 'json' | 'image' | 'audio' | 'any';

HOST OPERATOR LIBRARY (The Primitives):
Compose these to build tools.

${generateOperatorDocs()}

UI PRIMITIVES (Embodied I/O):
- "file-input": Outputs DataURL to 'valueBinding'.
- "slider": Outputs Number to 'valueBinding'.
- "canvas": Renders DataURL (Image) or Array (Chart) from 'textBinding'.
- "chart": Visualizes Array data from 'textBinding'.

EXAMPLE: IMAGE FILTER TOOL
{
  "pipelines": {
    "filter_pipe": {
      "inputs": { "rawImg": "image" },
      "nodes": [
        { "id": "n1", "op": "Image.Grayscale", "inputs": { "0": "$rawImg" } },
        { "id": "n2", "op": "Image.Invert", "inputs": { "0": "@n1" } }
      ],
      "output": "n2"
    }
  },
  "machine": {
    "initial": "idle",
    "states": {
      "idle": {
        "on": {
          "APPLY": { "actions": ["RUN:filter_pipe:processedImg"] }
        }
      }
    }
  },
  "view": {
    "type": "container",
    "children": [
      { "type": "file-input", "valueBinding": "rawImg" },
      { "type": "button", "onClick": "APPLY", "props": { "label": "Apply Filter" } },
      { "type": "canvas", "textBinding": "processedImg" }
    ]
  },
  "testVectors": [
    {
      "name": "Verify Pipeline Trigger",
      "initialState": "idle",
      "steps": [
        { "event": "APPLY", "expectState": "idle", "expectContextKeys": ["processedImg"] }
      ]
    }
  ]
}

CURRENT APP STATE (for context):
${JSON.stringify({ version: currentDef.version, contextKeys: Object.keys(currentDef.initialContext), stateCount: Object.keys(currentDef.machine.states).length }, null, 2)}

Generate the full AppDefinition JSON. Ensure all pipelines include 'inputs' declarations.
Use a timestamp-based version format like "v${new Date().toISOString().slice(0, 16).replace('T', '-')}" (e.g., "v2025-12-15-20:30").
`;
}

/**
 * Google Gemini AI Provider.
 * Uses Gemini 2.5 Flash for fast, structured JSON output.
 */
export class GeminiProvider implements AIProviderWithCapabilities {
  readonly name = "Gemini";
  readonly modelId: string;
  readonly capabilities: ModelCapabilities = {
    structuredOutput: true,
    selfCorrection: 'moderate',
    contextWindow: 1_000_000,
    codeOptimized: true,
  };

  private readonly client: GoogleGenAI;
  private readonly systemPromptAdditions?: string;

  constructor(config: AIProviderConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
    this.modelId = config.modelId ?? 'gemini-2.5-flash';
    this.systemPromptAdditions = config.systemPromptAdditions;
  }

  async generateProposal(
    currentDef: AppDefinition,
    prompt: string,
    feedback?: ExecutionFeedback | null
  ): Promise<AppDefinition> {
    const systemInstruction = buildSystemPrompt(currentDef, feedback, this.systemPromptAdditions);

    const fullPrompt = `USER REQUEST:\n"${prompt}"\n`;

    try {
      const response = await this.client.models.generateContent({
        model: this.modelId,
        contents: fullPrompt,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 }
        }
      });

      if (!response.text) {
        throw new Error("AI returned empty response");
      }
      
      // Parse with error handling
      let parsed: unknown;
      try {
        parsed = JSON.parse(response.text);
      } catch (parseError) {
        throw new Error(`AI returned invalid JSON: ${parseError instanceof Error ? parseError.message : 'Parse failed'}`);
      }
      
      // Validate shape
      if (!validateAppDefinitionShape(parsed)) {
        throw new Error("AI response missing required fields (version, initialContext, machine, view)");
      }
      
      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error("Gemini Generation Error:", message);
      throw new Error(`AI Synthesis Failed: ${message}`);
    }
  }
}

/**
 * Create a Gemini provider from environment variables.
 * Convenience factory for default configuration.
 * 
 * Note: Uses VITE_API_KEY for browser environments (Vite prefix required for exposure).
 */
export function createGeminiProvider(apiKey?: string): AIProvider {
  const key = apiKey ?? import.meta.env.VITE_API_KEY;
  if (!key) {
    throw new Error("VITE_API_KEY not found - required for Gemini provider");
  }
  return new GeminiProvider({ apiKey: key });
}
