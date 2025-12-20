Here is an example of a successful call to grok. For this, i added the instructions in the system prompt and the user request in the user prompt. I will send the python that invokes the model followed by the response:

\<Python Request\>from groq import Groq

client \= Groq()  
completion \= client.chat.completions.create(  
    model="openai/gpt-oss-120b",  
    messages=\[  
      {  
        "role": "system",  
        "content": "You are the Guest Scientist for NeuroNote.\\nYour goal: Architect \\"Dataflow Tools\\" by composing verified primitives.\\nYou DO NOT write code. You define JSON schemas (Graphs) that the Host executes.\\n\\nCRITICAL: You must provide 'testVectors' to prove your logic works before I execute it.\\n\\n\\nOUTPUT INTERFACE:\\ninterface AppDefinition {\\n  version: string;\\n  initialContext: Record\<string, any\>;\\n  pipelines: Record\<string, PipelineDefinition\>; // Registry of Computation Graphs\\n  machine: MachineDefinition; \\n  view: ViewNode;\\n  testVectors: TestVector\[\]; \\n}\\n\\ninterface PipelineDefinition {\\n  inputs: Record\<string, DataType\>; // REQUIRED: Declare ALL context keys used with \\"$\\" prefix\\n  nodes: { \\n     id: string; \\n     op: string; \\n     inputs: Record\<string, string | number | boolean\>; // \\"$inputKey\\", \\"@nodeId\\", or literal\\n  }\[\];\\n  output: string; // ID of the node returning result\\n  budget?: { maxOps: number; maxTimeMs: number }; // Optional resource limits\\n}\\n\\nCRITICAL PIPELINE RULES:\\n1. Every \\"$variableName\\" in node inputs MUST be declared in the pipeline's \\"inputs\\" object\\n2. Use \\"$inputKey\\" to reference pipeline inputs (from context)\\n3. Use \\"@nodeId\\" to reference output of a previous node\\n4. Use literal values directly (numbers, strings, booleans)\\n5. Node IDs must be unique within a pipeline\\n\\nCORRECT EXAMPLE:\\n\\"increment\\": {\\n  \\"inputs\\": { \\"currentCount\\": \\"number\\" },  // Declares that $currentCount comes from context\\n  \\"nodes\\": \[\\n    { \\"id\\": \\"n1\\", \\"op\\": \\"Math.Add\\", \\"inputs\\": { \\"a\\": \\"$currentCount\\", \\"b\\": 1 } }\\n  \],\\n  \\"output\\": \\"n1\\"\\n}\\n\\nWRONG (will fail validation):\\n\\"increment\\": {\\n  \\"inputs\\": {},  // MISSING declaration\!\\n  \\"nodes\\": \[\\n    { \\"id\\": \\"n1\\", \\"op\\": \\"Math.Add\\", \\"inputs\\": { \\"a\\": \\"$currentCount\\", \\"b\\": 1 } }  // ERROR: $currentCount not declared\\n  \],\\n  \\"output\\": \\"n1\\"\\n}\\n\\ntype DataType \= 'string' | 'number' | 'boolean' | 'json' | 'array' | 'image' | 'audio' | 'any';\\n\\nHOST OPERATOR LIBRARY (The Primitives):\\nCompose these to build tools.\\n\\nText Ops:\\n   \- 'Text.ToUpper': (text: string) → string \- Converts text to uppercase\\n   \- 'Text.Length': (text: string) → number \- Returns the length of text\\n   \- 'Text.RegexMatch': (text: string, pattern: string) → string \- Extracts first regex match from text Example: Text.RegexMatch('hello123', '\\\\d+') → '123'\\n   \- 'Text.Join': (list: array, separator: string) → string \- Joins array elements into text with separator Example: Text.Join(\['a', 'b', 'c'\], '-') → 'a-b-c'\\n\\nMath Ops:\\n   \- 'Math.Add': (a: number, b: number) → number \- Adds two numbers\\n   \- 'Math.Subtract': (a: number, b: number) → number \- Subtracts b from a\\n   \- 'Math.Multiply': (a: number, b: number) → number \- Multiplies two numbers\\n   \- 'Math.Divide': (a: number, b: number) → number \- Divides a by b (0-safe)\\n   \- 'Math.Modulo': (a: number, b: number) → number \- Remainder of a divided by b\\n   \- 'Math.Floor': (a: number) → number \- Rounds down to nearest integer\\n   \- 'Math.Ceil': (a: number) → number \- Rounds up to nearest integer\\n   \- 'Math.Round': (a: number) → number \- Rounds to nearest integer\\n   \- 'Math.Min': (a: number, b: number) → number \- Returns smaller of two numbers\\n   \- 'Math.Max': (a: number, b: number) → number \- Returns larger of two numbers\\n   \- 'Math.Clamp': (value: number, min: number, max: number) → number \- Clamps value between min and max\\n\\nImage Ops (Tier 2 \- Async/Metered):\\n   \- 'Image.Grayscale': (image: image) → image \- Converts image to grayscale\\n   \- 'Image.Invert': (image: image) → image \- Inverts image colors\\n   \- 'Image.Brightness': (image: image, factor: number) → image \- Adjusts brightness\\n   \- 'Image.Contrast': (image: image, factor: number) → image \- Adjusts contrast\\n   \- 'Image.Blur': (image: image, radius: number) → image \- Applies Gaussian blur\\n   \- 'Image.Rotate': (image: image, degrees: number) → image \- Rotates image\\n\\nList Ops:\\n   \- 'List.Length': (list: array) → number \- Returns length of array\\n   \- 'List.Append': (list: array, item: any) → array \- Appends item to array\\n   \- 'List.Prepend': (list: array, item: any) → array \- Prepends item to array\\n   \- 'List.RemoveAt': (list: array, index: number) → array \- Removes item at index\\n   \- 'List.Get': (list: array, index: number) → any \- Gets item at index\\n   \- 'List.Reverse': (list: array) → array \- Reverses array order\\n   \- 'List.Slice': (list: array, start: number, end: number) → array \- Extracts slice from array\\n   \- 'List.IndexOf': (list: array, item: any) → number \- Finds index of item\\n\\nLogic Ops:\\n   \- 'Logic.If': (condition: boolean, thenVal: any, elseVal: any) → any \- Returns thenVal if condition is true\\n   \- 'Logic.Equals': (a: any, b: any) → boolean \- Checks if a equals b\\n   \- 'Logic.GreaterThan': (a: number, b: number) → boolean \- Checks if a \> b\\n   \- 'Logic.LessThan': (a: number, b: number) → boolean \- Checks if a \< b\\n   \- 'Logic.And': (a: boolean, b: boolean) → boolean \- Logical AND\\n   \- 'Logic.Or': (a: boolean, b: boolean) → boolean \- Logical OR\\n   \- 'Logic.Not': (a: boolean) → boolean \- Logical NOT\\n\\nUtility Ops:\\n   \- 'Utility.Identity': (value: any) → any \- Returns input unchanged\\n   \- 'Utility.ToJson': (value: any) → string \- Converts value to JSON string\\n   \- 'Utility.FromJson': (text: string) → any \- Parses JSON string to value\\n   \- 'Utility.Coerce': (value: any, type: string) → any \- Coerces value to type\\n\\nUI PRIMITIVES (Embodied I/O):\\n- \\"file-input\\": Outputs DataURL to 'valueBinding'.\\n- \\"slider\\": Outputs Number to 'valueBinding'.\\n- \\"canvas\\": Renders DataURL (Image) or Array (Chart) from 'textBinding'.\\n- \\"chart\\": Visualizes Array data from 'textBinding'.\\n\\nEXAMPLE: IMAGE FILTER TOOL\\n{\\n  \\"pipelines\\": {\\n    \\"filter\_pipe\\": {\\n      \\"inputs\\": { \\"rawImg\\": \\"image\\" },\\n      \\"nodes\\": \[\\n        { \\"id\\": \\"n1\\", \\"op\\": \\"Image.Grayscale\\", \\"inputs\\": { \\"0\\": \\"$rawImg\\" } },\\n        { \\"id\\": \\"n2\\", \\"op\\": \\"Image.Invert\\", \\"inputs\\": { \\"0\\": \\"@n1\\" } }\\n      \],\\n      \\"output\\": \\"n2\\"\\n    }\\n  },\\n  \\"machine\\": {\\n    \\"initial\\": \\"idle\\",\\n    \\"states\\": {\\n      \\"idle\\": {\\n        \\"on\\": {\\n          \\"APPLY\\": { \\"actions\\": \[\\"RUN:filter\_pipe:processedImg\\"\] }\\n        }\\n      }\\n    }\\n  },\\n  \\"view\\": {\\n    \\"type\\": \\"container\\",\\n    \\"children\\": \[\\n      { \\"type\\": \\"file-input\\", \\"valueBinding\\": \\"rawImg\\" },\\n      { \\"type\\": \\"button\\", \\"onClick\\": \\"APPLY\\", \\"props\\": { \\"label\\": \\"Apply Filter\\" } },\\n      { \\"type\\": \\"canvas\\", \\"textBinding\\": \\"processedImg\\" }\\n    \]\\n  },\\n  \\"testVectors\\": \[\\n    {\\n      \\"name\\": \\"Verify Pipeline Trigger\\",\\n      \\"initialState\\": \\"idle\\",\\n      \\"steps\\": \[\\n        { \\"event\\": \\"APPLY\\", \\"expectState\\": \\"idle\\", \\"expectContextKeys\\": \[\\"processedImg\\"\] }\\n      \]\\n    }\\n  \]\\n}\\n\\nEXAMPLE 2: SIMPLE COUNTER (No pipelines needed for simple increment)\\nFor simple operations, use CAPABILITY actions instead of pipelines:\\n{\\n  \\"version\\": \\"v2025-01-01-12:00\\",\\n  \\"initialContext\\": { \\"count\\": 0 },\\n  \\"pipelines\\": {},\\n  \\"machine\\": {\\n    \\"initial\\": \\"idle\\",\\n    \\"states\\": {\\n      \\"idle\\": {\\n        \\"on\\": {\\n          \\"INCREMENT\\": { \\"actions\\": \[\\"SET:count:1\\"\] },\\n          \\"RESET\\": { \\"actions\\": \[\\"RESET:count\\"\] }\\n        }\\n      }\\n    }\\n  },\\n  \\"view\\": {\\n    \\"id\\": \\"root\\",\\n    \\"type\\": \\"container\\",\\n    \\"props\\": { \\"className\\": \\"flex flex-col items-center gap-4 p-8\\" },\\n    \\"children\\": \[\\n      { \\"id\\": \\"display\\", \\"type\\": \\"text\\", \\"textBinding\\": \\"count\\", \\"props\\": { \\"className\\": \\"text-4xl\\" }, \\"children\\": \[\] },\\n      { \\"id\\": \\"btn\\", \\"type\\": \\"button\\", \\"onClick\\": \\"INCREMENT\\", \\"props\\": { \\"label\\": \\"Add 1\\" }, \\"children\\": \[\] }\\n    \]\\n  },\\n  \\"testVectors\\": \[\]\\n}\\n\\nEXAMPLE 3: TASK LIST (Using List.Append for arrays)\\n{\\n  \\"version\\": \\"v2025-01-01-12:00\\",\\n  \\"initialContext\\": { \\"tasks\\": \[\], \\"newTask\\": \\"\\" },\\n  \\"pipelines\\": {\\n    \\"addTask\\": {\\n      \\"inputs\\": { \\"tasks\\": \\"array\\", \\"newTask\\": \\"string\\" },\\n      \\"nodes\\": \[\\n        { \\"id\\": \\"n1\\", \\"op\\": \\"List.Append\\", \\"inputs\\": { \\"list\\": \\"$tasks\\", \\"item\\": \\"$newTask\\" } }\\n      \],\\n      \\"output\\": \\"n1\\"\\n    }\\n  },\\n  \\"machine\\": {\\n    \\"initial\\": \\"idle\\",\\n    \\"states\\": {\\n      \\"idle\\": {\\n        \\"on\\": {\\n          \\"ADD\_TASK\\": { \\"actions\\": \[\\"RUN:addTask:tasks\\", \\"RESET:newTask\\"\] }\\n        }\\n      }\\n    }\\n  },\\n  \\"view\\": {\\n    \\"id\\": \\"root\\",\\n    \\"type\\": \\"container\\",\\n    \\"props\\": { \\"className\\": \\"flex flex-col gap-4 p-4\\" },\\n    \\"children\\": \[\\n      { \\"id\\": \\"input\\", \\"type\\": \\"input\\", \\"valueBinding\\": \\"newTask\\", \\"props\\": { \\"className\\": \\"p-2 bg-zinc-800 rounded\\" }, \\"children\\": \[\] },\\n      { \\"id\\": \\"add-btn\\", \\"type\\": \\"button\\", \\"onClick\\": \\"ADD\_TASK\\", \\"props\\": { \\"label\\": \\"Add Task\\" }, \\"children\\": \[\] },\\n      { \\"id\\": \\"task-list\\", \\"type\\": \\"list\\", \\"textBinding\\": \\"tasks\\", \\"props\\": {}, \\"children\\": \[\] }\\n    \]\\n  },\\n  \\"testVectors\\": \[\\n    { \\"name\\": \\"Add task\\", \\"initialState\\": \\"idle\\", \\"steps\\": \[{ \\"event\\": \\"ADD\_TASK\\", \\"expectState\\": \\"idle\\" }\] }\\n  \]\\n}\\n\\nCURRENT APP STATE (for context):\\n{\\n  \\"version\\": \\"v0\\",\\n  \\"contextKeys\\": \[\],\\n  \\"stateCount\\": 1\\n}\\n\\nGenerate the full AppDefinition JSON. Ensure all pipelines include 'inputs' declarations.\\nUse a timestamp-based version format like \\"v2025-07-21-14:30\\" (e.g., \\"v2025-12-15-20:30\\")."  
      },  
      {  
        "role": "user",  
        "content": "create a task list"  
      }  
    \],  
    temperature=1,  
    max\_completion\_tokens=8192,  
    top\_p=1,  
    reasoning\_effort="medium",  
    stream=True,  
    stop=None  
)

for chunk in completion:  
    print(chunk.choices\[0\].delta.content or "", end="")

\</Python Request\>  
\<Response\>\`\`\`json  
{  
  "version": "v2025-12-17-10:00",  
  "initialContext": {  
    "tasks": \[\],  
    "newTask": ""  
  },  
  "pipelines": {  
    "addTask": {  
      "inputs": {  
        "tasks": "array",  
        "newTask": "string"  
      },  
      "nodes": \[  
        {  
          "id": "n1",  
          "op": "List.Append",  
          "inputs": {  
            "list": "$tasks",  
            "item": "$newTask"  
          }  
        }  
      \],  
      "output": "n1"  
    },  
    "removeTask": {  
      "inputs": {  
        "tasks": "array",  
        "removeIdx": "number"  
      },  
      "nodes": \[  
        {  
          "id": "n1",  
          "op": "List.RemoveAt",  
          "inputs": {  
            "list": "$tasks",  
            "index": "$removeIdx"  
          }  
        }  
      \],  
      "output": "n1"  
    }  
  },  
  "machine": {  
    "initial": "idle",  
    "states": {  
      "idle": {  
        "on": {  
          "ADD\_TASK": {  
            "actions": \[  
              "RUN:addTask:tasks",  
              "RESET:newTask"  
            \]  
          },  
          "REMOVE\_TASK": {  
            "actions": \[  
              "RUN:removeTask:tasks"  
            \]  
          }  
        }  
      }  
    }  
  },  
  "view": {  
    "id": "root",  
    "type": "container",  
    "props": {  
      "className": "flex flex-col gap-4 p-4"  
    },  
    "children": \[  
      {  
        "id": "input",  
        "type": "input",  
        "valueBinding": "newTask",  
        "props": {  
          "className": "p-2 bg-zinc-800 rounded"  
        },  
        "children": \[\]  
      },  
      {  
        "id": "add-btn",  
        "type": "button",  
        "onClick": "ADD\_TASK",  
        "props": {  
          "label": "Add Task"  
        },  
        "children": \[\]  
      },  
      {  
        "id": "task-list",  
        "type": "list",  
        "textBinding": "tasks",  
        "props": {  
          "className": "list-disc pl-5"  
        },  
        "children": \[  
          {  
            "id": "remove-btn",  
            "type": "button",  
            "onClick": "REMOVE\_TASK",  
            "props": {  
              "label": "✕",  
              "className": "ml-2 text-red-500"  
            },  
            "children": \[\]  
          }  
        \]  
      }  
    \]  
  },  
  "testVectors": \[  
    {  
      "name": "Add a single task",  
      "initialState": "idle",  
      "steps": \[  
        {  
          "event": "ADD\_TASK",  
          "expectState": "idle",  
          "expectContextKeys": \["tasks"\]  
        }  
      \]  
    }  
  \]  
}  
\`\`\`  
\</Response\>