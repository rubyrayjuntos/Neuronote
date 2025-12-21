import { AppDefinition, OperatorSchema } from './types';
import { OPERATOR_REGISTRY as FULL_REGISTRY, getLegacyRegistry } from './operators';

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

/** Maximum cumulative complexity score for a single pipeline */
export const MAX_PIPELINE_COMPLEXITY = 50;

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
export const OPERATOR_REGISTRY: Record<string, OperatorSchema> = getLegacyRegistry(FULL_REGISTRY);

// ============================================================================
// VALIDATOR RULES
// These constants define the security rules enforced by the Gatekeeper.
// ============================================================================

export const OPCODES = ['SET', 'APPEND', 'RESET', 'TOGGLE', 'SPAWN', 'DELETE', 'ASSIGN', 'RUN'];

export const ALLOWED_OPS = Object.keys(OPERATOR_REGISTRY);

export const SAFE_TAGS = [
    'div', 'span', 'p', 'article', 'section', 'main', 'aside', 'header', 'footer', 'nav',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'button', 'input', 'label', 'form', 
    'hr', 'br', 'pre', 'code', 'blockquote'
];

export const FORBIDDEN_PROPS = [
    'dangerouslySetInnerHTML',
    'innerHTML',
    'outerHTML',
    'srcdoc',
    'formAction',
    'action',
];

export const FORBIDDEN_STYLE_PROPS = [
    'position',
    'zIndex',
    'z-index',
    'opacity',
    'visibility',
];

export const EVENT_HANDLER_PATTERN = /^on[A-Z]/;

export const ALLOWED_URL_PATTERNS = [
    /^\/[^/]/,
    /^\.?\.\//,
    /^#/,
    /^data:image\/(png|jpeg|gif|webp|svg)/i,
];

// Only block arbitrary values that contain CSS property injection (colon syntax)
// Safe: [100px], [200], [50%]  
// Dangerous: [color:red], [background:url(...)], [position:fixed]
export const TAILWIND_ARBITRARY_PATTERN = /\[[^\]]*:[^\]]*\]/;

export const FORBIDDEN_TAILWIND_CLASSES = [
    'fixed',
    'absolute',
    'sticky',
    'inset-0',
    'inset-x-0',
    'inset-y-0',
    'z-50', 'z-40', 'z-30', 'z-20', 'z-10',
    'opacity-0',
    'invisible',
    'hidden',
    'sr-only',
];

export const ALLOWED_TYPES = [
    // Legacy flat types (still supported)
    'container', 'text', 'button', 'input', 'header', 'list', 'tabs', 'card', 
    'element', 'icon', 'chart', 'clock',
    'file-input', 'slider', 'canvas',
    'text-input', 'text-display',
    'modal', 'toast', 'dropdown', 'tooltip', 'popover',
    
    // Hierarchical Input types (Layer 1 - Embodied I/O)
    'Input.Image', 'Input.Audio', 'Input.Text', 'Input.CSV', 'Input.JSON',
    'Input.Slider', 'Input.Toggle', 'Input.TextField', 'Input.TextArea',
    'Input.Dropzone', 'Input.ColorPicker', 'Input.File',
    
    // Hierarchical Display/Output types (Layer 1)
    'Display.Text', 'Display.Canvas', 'Display.List', 'Display.Chart',
    'Display.Header', 'Display.Clock', 'Display.Icon',
    'Output.Canvas', 'Output.VectorCanvas', 'Output.Chart', 'Output.Timeline',
    'Output.Text', 'Output.Toast', 'Output.Progress',
    
    // Control types 
    'Control.Button',
    
    // Layout types
    'Layout.Stack', 'Layout.Container', 'Layout.Card',
];

// ============================================================================
// SECURITY CONSTANTS
// ============================================================================

/**
 * Shared secret for signing and verifying AI proposals.
 * WARNING: In a production system, this MUST be a secure environment variable,
 * not a hardcoded constant.
 */
export const PROPOSAL_SIGNING_SECRET = 'a-very-secret-key-that-should-be-in-env';