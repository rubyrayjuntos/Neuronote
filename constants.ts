import { AppDefinition } from './types';

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
