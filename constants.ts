import { AppDefinition, OperatorSchema } from './types';
import { getOperatorRegistry } from './operators';

// ============================================================================
// GOVERNANCE CONSTANTS
// These values define the security and resource boundaries of the system.
// ============================================================================

/** Maximum QuickJS instructions before fuel limit triggers (Tier 1 sandbox) */
export const MAX_INSTRUCTIONS = 100_000;

/** Maximum memory for QuickJS runtime in bytes (32MB) */
export const WASM_MEMORY_LIMIT = 1024 * 1024 * 32;

/** Timeout for kernel boot in milliseconds */
export const KERNEL_BOOT_TIMEOUT_MS = 20_000;

/** Timeout for dispatch calls in milliseconds */
export const DISPATCH_TIMEOUT_MS = 1_000;

/** Default pipeline execution timeout in milliseconds */
export const DEFAULT_PIPELINE_TIMEOUT_MS = 1_000;

/** Maximum view tree depth to prevent stack overflow */
export const MAX_TREE_DEPTH = 50;

/** Maximum nodes in a single pipeline to prevent graph bombs */
export const MAX_PIPELINE_NODES = 50;

/** Maximum bytes a pipeline can process (input + intermediates + output) */
export const MAX_PIPELINE_BYTES = 50 * 1024 * 1024; // 50MB

/** Maximum output size from a single pipeline */
export const MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10MB

/** Maximum logs to keep in memory */
export const MAX_LOG_ENTRIES = 50;

/** Maximum change journal entries to persist */
export const MAX_JOURNAL_ENTRIES = 20;

/** Maximum interaction traces to keep */
export const MAX_INTERACTION_TRACES = 100;

/** Operator library version for provenance tracking */
export const OPERATOR_LIBRARY_VERSION = '1.0.0';

// ============================================================================
// SEED APPLICATION
// ============================================================================

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

// ============================================================================
// OPERATOR REGISTRY
// ============================================================================
// Re-exported from operators/registry.ts - the single source of truth.
// See operators/registry.ts for full definitions including tier, properties, and implementations.
export const OPERATOR_REGISTRY: Record<string, OperatorSchema> = getOperatorRegistry();