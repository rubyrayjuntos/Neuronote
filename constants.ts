import { AppDefinition, OperatorSchema } from './types';

// The "Seed" Application.
// A simple read-only note viewer that transitions to an editor.
export const INITIAL_APP: AppDefinition = {
  version: "v0.1-seed",
  initialContext: {
    title: "Welcome to NeuroNote",
    content: "This is a malleable application. The UI and Logic you see here are defined by data, not hard-coded React components. Ask the AI to 'Make this a todo list' or 'Add a dark mode toggle' to see the architecture rewrite itself."
  },
  machine: {
    initial: "viewing",
    states: {
      viewing: {
        on: {
          EDIT: "editing"
        }
      },
      editing: {
        on: {
          SAVE: "viewing",
          CANCEL: "viewing"
        }
      }
    }
  },
  view: {
    id: "root",
    type: "container",
    props: { className: "p-6 max-w-2xl mx-auto bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col gap-4" },
    children: [
      {
        id: "header",
        type: "header",
        textBinding: "title",
        props: { className: "text-2xl font-bold text-zinc-100" }
      },
      {
        id: "content-display",
        type: "text",
        textBinding: "content",
        props: { className: "text-zinc-400 leading-relaxed min-h-[100px] whitespace-pre-wrap" }
      },
      {
        id: "toolbar",
        type: "container",
        props: { className: "flex flex-row gap-2 pt-4 border-t border-zinc-800" },
        children: [
          {
            id: "edit-btn",
            type: "button",
            props: { label: "Edit Note", className: "px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors" },
            onClick: "EDIT"
          }
        ]
      }
    ]
  }
};

// --- OPERATOR REGISTRY (TYPE SYSTEM) ---
export const OPERATOR_REGISTRY: Record<string, OperatorSchema> = {
    // TEXT
    'Text.ToUpper': {
        op: 'Text.ToUpper',
        inputs: [{ name: 'text', type: 'string' }],
        output: 'string',
        description: 'Converts text to uppercase',
        pure: true
    },
    'Text.RegexMatch': {
        op: 'Text.RegexMatch',
        inputs: [{ name: 'text', type: 'string' }, { name: 'pattern', type: 'string' }],
        output: 'string',
        description: 'Extracts regex match',
        pure: true
    },
    'Text.Join': {
        op: 'Text.Join',
        inputs: [{ name: 'list', type: 'any' }, { name: 'separator', type: 'string' }],
        output: 'string',
        description: 'Joins a list into text',
        pure: true
    },
    'Text.Length': {
        op: 'Text.Length',
        inputs: [{ name: 'text', type: 'string' }],
        output: 'number',
        description: 'Returns length of text',
        pure: true
    },

    // MATH
    'Math.Add': {
        op: 'Math.Add',
        inputs: [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }],
        output: 'number',
        description: 'Addition',
        pure: true
    },
    'Math.Subtract': {
        op: 'Math.Subtract',
        inputs: [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }],
        output: 'number',
        description: 'Subtraction',
        pure: true
    },
    'Math.Multiply': {
        op: 'Math.Multiply',
        inputs: [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }],
        output: 'number',
        description: 'Multiplication',
        pure: true
    },
    'Math.Divide': {
        op: 'Math.Divide',
        inputs: [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }],
        output: 'number',
        description: 'Division',
        pure: true
    },
    'Math.Threshold': {
        op: 'Math.Threshold',
        inputs: [{ name: 'value', type: 'number' }, { name: 'threshold', type: 'number' }],
        output: 'number',
        description: 'Returns 1 if value > threshold, else 0',
        pure: true
    },

    // IMAGE
    'Image.Grayscale': {
        op: 'Image.Grayscale',
        inputs: [{ name: 'image', type: 'image' }],
        output: 'image',
        description: 'Converts image to grayscale',
        pure: true
    },
    'Image.Invert': {
        op: 'Image.Invert',
        inputs: [{ name: 'image', type: 'image' }],
        output: 'image',
        description: 'Inverts colors',
        pure: true
    },
    'Image.EdgeDetect': {
        op: 'Image.EdgeDetect',
        inputs: [{ name: 'image', type: 'image' }],
        output: 'image',
        description: 'Performs edge detection',
        pure: true
    },
    'Image.Resize': {
        op: 'Image.Resize',
        inputs: [{ name: 'image', type: 'image' }],
        output: 'image',
        description: 'Resizes image',
        pure: true
    },
    'Image.Threshold': {
        op: 'Image.Threshold',
        inputs: [{ name: 'image', type: 'image' }],
        output: 'image',
        description: 'Applies black/white threshold',
        pure: true
    },

    // AUDIO
    'Audio.FFT': {
        op: 'Audio.FFT',
        inputs: [{ name: 'audio', type: 'audio' }],
        output: 'any', // Array<number> really, but 'any' allows list ops
        description: 'Performs FFT on audio',
        pure: true
    },
    'Audio.PeakDetect': {
        op: 'Audio.PeakDetect',
        inputs: [{ name: 'audio', type: 'audio' }],
        output: 'boolean',
        description: 'Detects peak volume',
        pure: true
    },

    // LIST/LOGIC
    'List.Map': {
        op: 'List.Map',
        inputs: [{ name: 'list', type: 'any' }],
        output: 'any',
        description: 'Maps over a list',
        pure: true
    },
    'List.Filter': {
        op: 'List.Filter',
        inputs: [{ name: 'list', type: 'any' }],
        output: 'any',
        description: 'Filters a list',
        pure: true
    },
    'List.Sort': {
        op: 'List.Sort',
        inputs: [{ name: 'list', type: 'any' }],
        output: 'any',
        description: 'Sorts a list',
        pure: true
    },
    'List.Take': {
        op: 'List.Take',
        inputs: [{ name: 'list', type: 'any' }, { name: 'count', type: 'number' }],
        output: 'any',
        description: 'Takes n items',
        pure: true
    },
    'Logic.If': {
        op: 'Logic.If',
        inputs: [{ name: 'condition', type: 'boolean' }, { name: 'trueVal', type: 'any' }, { name: 'falseVal', type: 'any' }],
        output: 'any',
        description: 'Conditional',
        pure: true
    },
    'Utility.JsonPath': {
        op: 'Utility.JsonPath',
        inputs: [{ name: 'json', type: 'json' }, { name: 'path', type: 'string' }],
        output: 'any',
        description: 'Extracts value from JSON',
        pure: true
    }
};