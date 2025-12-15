import { GoogleGenAI } from "@google/genai";
import { AppDefinition } from "../types";

export const generateAppProposal = async (
  currentDef: AppDefinition,
  userPrompt: string
): Promise<AppDefinition> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API_KEY not found in environment");

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
You are the Guest Scientist for NeuroNote.
Your goal: Architect "Dataflow Tools" by composing verified primitives.
You DO NOT write code. You define JSON schemas (Graphs) that the Host executes.

CRITICAL: You must provide 'testVectors' to prove your logic works before I execute it.

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
  nodes: { 
     id: string; 
     op: string; 
     inputs: Record<string, string | number | boolean>; // "$var", "@nodeId", or literal
  }[];
  output: string; // ID of the node returning result
}

HOST OPERATOR LIBRARY (The Primitives):
Compose these to build tools.

1. Text Ops:
   - 'Text.ToUpper', 'Text.RegexMatch', 'Text.Join', 'Text.Length'

2. Math Ops:
   - 'Math.Add', 'Math.Subtract', 'Math.Multiply', 'Math.Divide'
   - 'Math.Threshold': [Number, Threshold] -> 1 or 0

3. Image Ops (Safe Offscreen Processing):
   - 'Image.Grayscale': [DataURL] -> DataURL
   - 'Image.Invert': [DataURL] -> DataURL
   - 'Image.EdgeDetect': [DataURL] -> DataURL (Simulated)

4. Audio Ops (Real Signal Processing):
   - 'Audio.FFT': [DataURL] -> Array<Number> (Spectrum)
   - 'Audio.PeakDetect': [DataURL] -> Boolean

5. Logic/List Ops (Control Flow):
   - 'List.Sort', 'List.Filter', 'List.Take', 'List.Map'
   - 'Logic.If', 'Utility.JsonPath'

UI PRIMITIVES (Embodied I/O):
- "file-input": Outputs DataURL to 'valueBinding'.
- "slider": Outputs Number to 'valueBinding'.
- "canvas": Renders DataURL (Image) or Array (Chart) from 'textBinding'.
- "chart": Visualizes Array data from 'textBinding'.

EXAMPLE: IMAGE FILTER TOOL
{
  "pipelines": {
    "filter_pipe": {
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

USER REQUEST:
"${userPrompt}"

Generate the full AppDefinition JSON.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as AppDefinition;
    }
    throw new Error("No JSON returned from AI");
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
};