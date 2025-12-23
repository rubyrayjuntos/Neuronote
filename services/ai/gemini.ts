import { GoogleGenAI } from "@google/genai";
import { AppDefinition } from "../../types";
import { AIProvider, AIProviderConfig, AIProviderWithCapabilities, ExecutionFeedback, ModelCapabilities, PromptOptions } from "./types";
import { buildOperatorSection } from "./promptBuilder";
import { isAppDefinition, validateAppDefinition, formatZodErrors, repairProposal, buildRepairFeedback } from "../../schemas";

/**
 * Validates that a parsed object has the minimum required shape of an AppDefinition.
 * Uses Zod schema validation for comprehensive type checking.
 */
const validateAppDefinitionShape = isAppDefinition;

/**
 * JSON Schema for AppDefinition - used by AI to ensure correct output format.
 * This is the single source of truth for the AI response format.
 */
const APP_DEFINITION_SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AppDefinition",
  "type": "object",
  "required": ["version", "initialContext", "pipelines", "machine", "view", "testVectors"],
  "additionalProperties": false,
  "properties": {
    "version": { 
      "type": "string", 
      "pattern": "^v\\d{4}-\\d{2}-\\d{2}-\\d{2}:\\d{2}$",
      "description": "Version string like v2025-12-16-14:30" 
    },
    "initialContext": { 
      "type": "object", 
      "description": "Initial state values (key-value pairs)" 
    },
    "pipelines": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["inputs", "nodes", "output"],
        "properties": {
          "inputs": { 
            "type": "object",
            "description": "REQUIRED: Declare ALL context keys used with $ prefix. E.g. {\"count\": \"number\"} if using $count"
          },
          "nodes": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["id", "op", "inputs"],
              "properties": {
                "id": { "type": "string" },
                "op": { "type": "string" },
                "inputs": { "type": "object" }
              }
            }
          },
          "output": { "type": "string", "description": "ID of the node returning result" }
        }
      }
    },
    "machine": {
      "type": "object",
      "required": ["initial", "states"],
      "properties": {
        "initial": { "type": "string" },
        "states": { "type": "object" }
      }
    },
    "view": {
      "type": "object",
      "required": ["id", "type"],
      "properties": {
        "id": { "type": "string" },
        "type": { "type": "string", "description": "Component type (e.g., Input.Image, Display.Canvas, Layout.Stack, Control.Button, or legacy: container, text, button)" },
        "props": { "type": "object" },
        "children": { "type": "array" },
        "textBinding": { "type": "string" },
        "valueBinding": { "type": "string" },
        "onClick": { "type": "string" },
        "onEvent": { "type": "string", "description": "Event name to dispatch (e.g., FILE_SELECTED, VALUE_CHANGED, CLICK)" }
      }
    },
    "testVectors": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "initialState", "steps"],
        "properties": {
          "name": { "type": "string" },
          "initialState": { "type": "string" },
          "steps": { "type": "array" }
        }
      }
    }
  }
};

/**
 * Build the system instruction prompt for NeuroNote.
 * Follows best practices for JSON-only AI responses:
 * 1. Explicit JSON Schema
 * 2. Clear delimiters
 * 3. Concrete examples
 * 4. Error handling format
 * 
 * Supports two-phase "Diner Menu" pattern:
 * - Phase 1 (useMenu=true): Send abbreviated operator menu
 * - Phase 2 (selectedOperators): Send full specs for AI's selection
 */
export function buildSystemPrompt(
  currentDef: AppDefinition,
  feedback?: ExecutionFeedback | null,
  additions?: string,
  options?: PromptOptions
): string {
  const versionExample = `v${new Date().toISOString().slice(0, 16).replace('T', '-')}`;
  
  // Build operator section using shared builder (supports two-phase retrieval)
  const operatorSection = buildOperatorSection(options);
  
  // Build feedback section if previous attempt failed
  const feedbackSection = feedback ? `
<<<VALIDATION_ERROR>>>
Your last response failed validation:
- Version: ${feedback.failedVersion}
- Error: ${feedback.errorMessage}
${feedback.validationFailures?.length ? feedback.validationFailures.map(f => `- ${f}`).join('\n') : ''}
Fix this in your next response.
<<<END_VALIDATION_ERROR>>>
` : '';

  const customAdditions = additions ? `\n${additions}\n` : '';

  return `You are a JSON-only API for NeuroNote. Respond ONLY with a valid JSON object matching the schema below.
Do NOT wrap the JSON in markdown fences, code blocks, or add any explanation text.
The very first character of your reply must be { and the last must be }.

<<<SCHEMA>>>
${JSON.stringify(APP_DEFINITION_SCHEMA, null, 2)}
<<<END_SCHEMA>>>

<<<CRITICAL_RULES>>>
PIPELINE INPUT DECLARATIONS:
Every "$variableName" in node inputs MUST be declared in that pipeline's "inputs" object.
- "$foo" in a node → requires "foo": "<type>" in inputs
- "@nodeId" references another node's output (no declaration needed)
- Literal values (numbers, strings, booleans) need no declaration

VALID: { "inputs": { "count": "number" }, "nodes": [{ "id": "n1", "op": "Math.Add", "inputs": { "a": "$count", "b": 1 } }] }
INVALID: { "inputs": {}, "nodes": [{ "id": "n1", "op": "Math.Add", "inputs": { "a": "$count", "b": 1 } }] }
         ↑ FAILS: $count used but not declared in inputs

VIEW NODES: Every view node must have "id", "type", "props", "children" (children can be empty array []).

ACTIONS: Use "RUN:pipelineName:outputKey" to run pipeline and store result, "RESET:key" to reset to initial value.
<<<END_CRITICAL_RULES>>>
${feedbackSection}
${customAdditions}
${operatorSection}

UI Types: container, text, button, input, file-input, slider, canvas, chart, list
- input/slider/file-input: use "valueBinding" to bind to context key
- text/canvas/chart/list: use "textBinding" to display context value
- button: use "onClick" to trigger event

<<<EXAMPLE>>>
User request: "add a task list"

Correct JSON response:
{
  "version": "${versionExample}",
  "initialContext": { "tasks": [], "newTask": "" },
  "pipelines": {
    "addTask": {
      "inputs": { "tasks": "array", "newTask": "string" },
      "nodes": [
        { "id": "n1", "op": "List.Append", "inputs": { "list": "$tasks", "item": "$newTask" } }
      ],
      "output": "n1"
    }
  },
  "machine": {
    "initial": "idle",
    "states": {
      "idle": {
        "on": {
          "ADD_TASK": { "actions": ["RUN:addTask:tasks", "RESET:newTask"] }
        }
      }
    }
  },
  "view": {
    "id": "root",
    "type": "container",
    "props": { "className": "flex flex-col gap-4 p-4" },
    "children": [
      { "id": "input", "type": "input", "valueBinding": "newTask", "props": { "placeholder": "New task..." }, "children": [] },
      { "id": "add-btn", "type": "button", "onClick": "ADD_TASK", "props": { "label": "Add Task" }, "children": [] },
      { "id": "list", "type": "list", "textBinding": "tasks", "props": {}, "children": [] }
    ]
  },
  "testVectors": [
    { "name": "Add task works", "initialState": "idle", "steps": [{ "event": "ADD_TASK", "expectState": "idle" }] }
  ]
}
<<<END_EXAMPLE>>>

<<<CONTEXT>>>
Current app state: ${JSON.stringify({ version: currentDef.version, contextKeys: Object.keys(currentDef.initialContext), stateCount: Object.keys(currentDef.machine.states).length })}
<<<END_CONTEXT>>>

If you cannot produce a valid AppDefinition, reply with exactly:
{"error": "<brief reason>"}

Now respond to the user request with a complete, valid JSON AppDefinition.`;
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
    // Use full operator docs - abbreviated menu doesn't provide enough structural context
    const systemInstruction = buildSystemPrompt(currentDef, feedback, this.systemPromptAdditions);

    // Simple user prompt with delimiter (matching the format in system prompt example)
    const fullPrompt = `<<<USER_REQUEST>>>
${prompt}
<<<END_USER_REQUEST>>>`;

    try {
      console.log('[GEMINI] Sending request, system prompt length:', systemInstruction.length);
      
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
      
      // Log token usage if available
      if (response.usageMetadata) {
        console.log('[GEMINI] 📊 Token Usage:', {
          prompt_tokens: response.usageMetadata.promptTokenCount,
          completion_tokens: response.usageMetadata.candidatesTokenCount,
          total_tokens: response.usageMetadata.totalTokenCount
        });
      }
      
      console.log('[GEMINI] Response received, length:', response.text.length);
      
      // Parse with error handling
      let parsed: unknown;
      try {
        parsed = JSON.parse(response.text);
      } catch (parseError) {
        console.error('[GEMINI] JSON parse failed:', response.text.substring(0, 500));
        throw new Error(`AI returned invalid JSON: ${parseError instanceof Error ? parseError.message : 'Parse failed'}`);
      }
      
      // REPAIR PHASE: Fix common AI mistakes before validation
      const repairResult = repairProposal(parsed);
      if (repairResult.repaired) {
        console.log('[GEMINI] 🔧 Applied auto-repairs:', repairResult.fixes);
        parsed = repairResult.proposal;
      }

      // VALIDATION PHASE: Now validate with Zod
      const validationResult = validateAppDefinition(parsed);
      if (!validationResult.success) {
        console.error('[GEMINI] Zod validation failed after repair attempt');
        console.error('[GEMINI] Zod errors:', formatZodErrors(validationResult.error));
        
        // Build feedback for potential self-correction retry
        const feedbackMsg = buildRepairFeedback(
          validationResult.error.issues,
          repairResult.fixes
        );
        console.error('[GEMINI] AI Feedback:\n', feedbackMsg);
        
        throw new Error("AI response missing required fields (version, initialContext, machine, view)");
      }
      
      console.log('[GEMINI] ✅ Proposal validated successfully');
      return parsed as AppDefinition;
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
