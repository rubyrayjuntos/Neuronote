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
 */
export function buildSystemPrompt(
  currentDef: AppDefinition,
  feedback?: ExecutionFeedback | null,
  additions?: string
): string {
  const versionExample = `v${new Date().toISOString().slice(0, 16).replace('T', '-')}`;
  
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
<<<OPERATORS>>>
${generateOperatorDocs()}

UI Types: container, text, button, input, file-input, slider, canvas, chart, list
- input/slider/file-input: use "valueBinding" to bind to context key
- text/canvas/chart/list: use "textBinding" to display context value
- button: use "onClick" to trigger event
<<<END_OPERATORS>>>

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
      
      console.log('[GEMINI] Response received, length:', response.text.length);
      
      // Parse with error handling
      let parsed: unknown;
      try {
        parsed = JSON.parse(response.text);
      } catch (parseError) {
        console.error('[GEMINI] JSON parse failed:', response.text.substring(0, 500));
        throw new Error(`AI returned invalid JSON: ${parseError instanceof Error ? parseError.message : 'Parse failed'}`);
      }
      
      // Validate shape
      if (!validateAppDefinitionShape(parsed)) {
        console.error('[GEMINI] Shape validation failed:', parsed);
        throw new Error("AI response missing required fields (version, initialContext, machine, view)");
      }
      
      console.log('[GEMINI] Proposal validated successfully');
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
