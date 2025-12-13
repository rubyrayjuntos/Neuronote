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
You are the Guest Intelligence for NeuroNote, a Malleable Software system.
Your goal is to rewrite the application logic and UI based on the user's request.
You do NOT output code. You output a JSON artifacts definition.

Output strict JSON matching this interface:

interface AppDefinition {
  version: string;
  initialContext: Record<string, any>;
  machine: MachineDefinition; 
  actors?: Record<string, MachineDefinition>; 
  view: ViewNode;
  testVectors: TestVector[]; // REQUIRED: Proof that your logic works
}

interface TestVector {
  name: string;
  initialState: string;
  steps: { event: string; expectState?: string; expectContextKeys?: string[] }[];
}

interface MachineDefinition {
  initial: string;
  states: Record<string, { 
    on?: Record<string, string | { target?: string; actions?: string[] }> 
  }>;
}

interface ViewNode {
  id: string;
  type: 'container' | 'text' | 'button' | 'input' | 'header' | 'list' | 'tabs' | 'card';
  props?: Record<string, any>;
  children?: ViewNode[];
  textBinding?: string;
  valueBinding?: string;
  onClick?: string;
  onChange?: string;
}

HOST CAPABILITY MANIFEST (The Allowlist):
The Host Runtime strictly enforces these actions. Any other action string will cause a Governance Violation.

1. "SPAWN:actorType:targetArrayKey"
   - Creates a new actor instance in context[targetArrayKey].
   - Requires 'actorType' to be defined in 'actors'.

2. "APPEND:sourceKey:targetArrayKey"
   - Pushes context[sourceKey] into context[targetArrayKey].

3. "RESET:key"
   - Sets context[key] to empty string.

4. "TOGGLE:key"
   - Toggles boolean context[key].

5. "SET:key:value"
   - Sets context[key] to literal 'value'.

6. "DELETE"
   - Destroys the current actor instance (invalid in root scope).

VERIFICATION REQUIREMENT:
You must provide at least one TestVector to prove your features work. 
For example, if you add a "Todo List", provide a vector that fires "ADD_TASK" and expects "items" to change in context.

DATA PERSISTENCE:
Keep matching keys in 'initialContext' to preserve user data during hot-swaps.

CURRENT APP DEFINITION:
${JSON.stringify(currentDef, null, 2)}

USER REQUEST:
"${userPrompt}"

Generate the new full AppDefinition JSON.
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