/**
 * Zod Schemas for NeuroNote Core Types
 * 
 * These schemas provide:
 * 1. Runtime validation with detailed error messages
 * 2. Type inference (DRY - types derived from schemas)
 * 3. Security boundary enforcement
 * 
 * @module schemas
 */

import { z } from 'zod';

// ============================================================================
// PRIMITIVE SCHEMAS
// ============================================================================

/**
 * Data types supported by the pipeline system
 */
export const DataTypeSchema = z.enum([
  'string', 'number', 'boolean', 'json', 'image', 'audio', 'array', 'any'
]);
export type DataType = z.infer<typeof DataTypeSchema>;

/**
 * All allowed node types (component whitelist)
 * Security: This is the source of truth for what can be rendered
 */
export const NodeTypeSchema = z.enum([
  // Legacy flat types (still supported)
  'container', 'text', 'button', 'input', 'header', 'list', 'tabs', 'card',
  'element', 'icon', 'chart', 'clock',
  'file-input', 'slider', 'canvas',
  'text-input', 'text-display',
  // HOST PRIMITIVES - Safe overlay patterns
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
]);
export type NodeType = z.infer<typeof NodeTypeSchema>;

// ============================================================================
// VIEW SCHEMAS (UI Structure)
// ============================================================================

/**
 * Base ViewNode schema - defines the shape without recursion
 */
const BaseViewNodeSchema = z.object({
  id: z.string().min(1, 'Node ID is required'),
  type: NodeTypeSchema,
  tag: z.string().optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  textBinding: z.string().optional(),
  valueBinding: z.string().optional(),
  binding: z.string().optional(),
  onClick: z.string().optional(),
  onChange: z.string().optional(),
  onEvent: z.string().optional(),
});

/**
 * ViewNode type - recursive tree structure for UI
 */
export type ViewNode = z.infer<typeof BaseViewNodeSchema> & {
  children?: ViewNode[];
};

/**
 * ViewNode schema with recursive children
 * Security: Validates component types, prevents XSS in bindings
 */
export const ViewNodeSchema: z.ZodType<ViewNode> = BaseViewNodeSchema.extend({
  children: z.lazy(() => z.array(ViewNodeSchema)).optional(),
});

// ============================================================================
// MACHINE SCHEMAS (State Logic)
// ============================================================================

/**
 * Transition can be a simple target string or full object
 */
export const TransitionSchema = z.union([
  z.string(),
  z.object({
    target: z.string().optional(),
    actions: z.array(z.string()).optional(),
  }),
]);
export type Transition = z.infer<typeof TransitionSchema>;

/**
 * Individual state definition
 */
export const MachineStateSchema = z.object({
  on: z.record(z.string(), TransitionSchema).optional(),
  entry: z.array(z.string()).optional(),
});
export type MachineState = z.infer<typeof MachineStateSchema>;

/**
 * Complete state machine definition
 */
export const MachineDefinitionSchema = z.object({
  initial: z.string().min(1, 'Initial state is required'),
  pulse: z.number().optional(),
  states: z.record(z.string(), MachineStateSchema),
});
export type MachineDefinition = z.infer<typeof MachineDefinitionSchema>;

/**
 * Validates that initial state exists in states (use separately if needed)
 */
export function validateMachineInitialState(machine: MachineDefinition): boolean {
  return machine.states[machine.initial] !== undefined;
}

// ============================================================================
// PIPELINE SCHEMAS (Dataflow)
// ============================================================================

/**
 * Port specification for operator inputs/outputs
 */
export const PortSpecSchema = z.object({
  name: z.string(),
  type: DataTypeSchema,
});
export type PortSpec = z.infer<typeof PortSpecSchema>;

/**
 * Pipeline node - single operator in the graph
 */
export const PipelineNodeSchema = z.object({
  id: z.string().min(1, 'Node ID is required'),
  op: z.string(), // Validated against OPERATOR_REGISTRY at runtime
  inputs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});
export type PipelineNode = z.infer<typeof PipelineNodeSchema>;

/**
 * Pipeline budget constraints
 */
export const PipelineBudgetSchema = z.object({
  maxOps: z.number().positive(),
  maxTimeMs: z.number().positive(),
  maxBytes: z.number().positive().optional(),
  maxOutputBytes: z.number().positive().optional(),
});
export type PipelineBudget = z.infer<typeof PipelineBudgetSchema>;

/**
 * Pipeline provenance tracking
 */
export const PipelineProvenanceSchema = z.object({
  operatorLibraryVersion: z.string(),
  rationale: z.string().optional(),
  createdAt: z.number().optional(),
});
export type PipelineProvenance = z.infer<typeof PipelineProvenanceSchema>;

/**
 * Pipeline properties
 */
export const PipelinePropertiesSchema = z.object({
  invertible: z.boolean().optional(),
});
export type PipelineProperties = z.infer<typeof PipelinePropertiesSchema>;

/**
 * Complete pipeline definition
 */
export const PipelineDefinitionSchema = z.object({
  inputs: z.record(z.string(), DataTypeSchema),
  nodes: z.array(PipelineNodeSchema),
  output: z.string(),
  budget: PipelineBudgetSchema.optional(),
  provenance: PipelineProvenanceSchema.optional(),
  properties: PipelinePropertiesSchema.optional(),
});
export type PipelineDefinition = z.infer<typeof PipelineDefinitionSchema>;

// ============================================================================
// TOOL BINDING SCHEMAS
// ============================================================================

export const ToolPortBindingSchema = z.object({
  uiNodeId: z.string(),
  pipelinePort: z.string(),
  direction: z.enum(['input', 'output']),
});
export type ToolPortBinding = z.infer<typeof ToolPortBindingSchema>;

export const ToolBindingDefinitionSchema = z.object({
  pipelineId: z.string(),
  bindings: z.array(ToolPortBindingSchema),
  triggerEvent: z.string().optional(),
});
export type ToolBindingDefinition = z.infer<typeof ToolBindingDefinitionSchema>;

// ============================================================================
// TEST VECTOR SCHEMAS
// ============================================================================

export const TestVectorStepSchema = z.object({
  event: z.string(),
  payload: z.unknown().optional(),
  expectState: z.string().optional(),
  expectContextKeys: z.array(z.string()).optional(),
});
export type TestVectorStep = z.infer<typeof TestVectorStepSchema>;

export const TestVectorSchema = z.object({
  name: z.string(),
  initialState: z.string().optional(), // Defaults to machine.initial if not provided
  steps: z.array(TestVectorStepSchema),
});
export type TestVector = z.infer<typeof TestVectorSchema>;

// ============================================================================
// APP DEFINITION SCHEMA (Top-Level)
// ============================================================================

/**
 * Complete application definition
 * This is the main schema for validating AI proposals
 */
export const AppDefinitionSchema = z.object({
  version: z.string().min(1, 'Version is required'),
  view: ViewNodeSchema,
  machine: MachineDefinitionSchema,
  actors: z.record(z.string(), MachineDefinitionSchema).optional(),
  pipelines: z.record(z.string(), PipelineDefinitionSchema).optional(),
  toolBindings: z.array(ToolBindingDefinitionSchema).optional(),
  initialContext: z.record(z.string(), z.unknown()),
  testVectors: z.array(TestVectorSchema).optional(),
  signature: z.string().optional(),
});
export type AppDefinition = z.infer<typeof AppDefinitionSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validates an unknown value as an AppDefinition
 * Returns { success: true, data } or { success: false, error }
 */
export function validateAppDefinition(value: unknown) {
  return AppDefinitionSchema.safeParse(value);
}

/**
 * Validates and throws on failure (for cases where we want exceptions)
 */
export function parseAppDefinition(value: unknown): AppDefinition {
  return AppDefinitionSchema.parse(value);
}

/**
 * Type guard using Zod
 */
export function isAppDefinition(value: unknown): value is AppDefinition {
  return AppDefinitionSchema.safeParse(value).success;
}

/**
 * Get human-readable error messages from Zod errors
 * Note: Zod 4 uses `issues` instead of `errors`
 */
export function formatZodErrors(error: z.ZodError): string[] {
  return error.issues.map(e => {
    const path = e.path.join('.');
    return path ? `${path}: ${e.message}` : e.message;
  });
}

// ============================================================================
// REPORT SCHEMAS
// ============================================================================

export const CheckResultSchema = z.object({
  name: z.string(),
  status: z.enum(['PASS', 'FAIL', 'WARN']),
  message: z.string(),
  evidence: z.record(z.string(), z.unknown()).optional(),
  recommendedFix: z.string().optional(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const VerificationReportSchema = z.object({
  timestamp: z.number(),
  passed: z.boolean(),
  score: z.number(),
  checks: z.object({
    structural: z.array(CheckResultSchema),
    semantic: z.array(CheckResultSchema),
    honesty: z.array(CheckResultSchema),
  }),
});
export type VerificationReport = z.infer<typeof VerificationReportSchema>;

// ============================================================================
// PROPOSAL REPAIR - Fix common AI mistakes before validation
// ============================================================================

/**
 * Mapping of common casing mistakes to correct values
 */
const NODE_TYPE_CORRECTIONS: Record<string, string> = {
  // Lowercase hierarchical to PascalCase
  'input.image': 'Input.Image',
  'input.audio': 'Input.Audio',
  'input.text': 'Input.Text',
  'input.csv': 'Input.CSV',
  'input.json': 'Input.JSON',
  'input.slider': 'Input.Slider',
  'input.toggle': 'Input.Toggle',
  'input.textfield': 'Input.TextField',
  'input.textarea': 'Input.TextArea',
  'input.dropzone': 'Input.Dropzone',
  'input.colorpicker': 'Input.ColorPicker',
  'input.file': 'Input.File',
  'display.text': 'Display.Text',
  'display.canvas': 'Display.Canvas',
  'display.list': 'Display.List',
  'display.chart': 'Display.Chart',
  'display.header': 'Display.Header',
  'display.clock': 'Display.Clock',
  'display.icon': 'Display.Icon',
  'output.canvas': 'Output.Canvas',
  'output.vectorcanvas': 'Output.VectorCanvas',
  'output.chart': 'Output.Chart',
  'output.timeline': 'Output.Timeline',
  'output.text': 'Output.Text',
  'output.toast': 'Output.Toast',
  'output.progress': 'Output.Progress',
  'control.button': 'Control.Button',
  'layout.stack': 'Layout.Stack',
  'layout.container': 'Layout.Container',
  'layout.card': 'Layout.Card',
};

/**
 * Result of attempting to repair a proposal
 */
export interface RepairResult {
  repaired: boolean;
  fixes: string[];
  proposal: unknown;
}

/**
 * Attempt to repair common AI mistakes in a proposal.
 * This runs BEFORE Zod validation to fix issues that would otherwise fail.
 * 
 * Fixes:
 * - Component type casing (input.audio → Input.Audio)
 * - Missing children arrays on view nodes
 * 
 * @param proposal - The raw parsed proposal from AI
 * @returns Repair result with fixed proposal and list of fixes applied
 */
export function repairProposal(proposal: unknown): RepairResult {
  const fixes: string[] = [];
  
  if (!proposal || typeof proposal !== 'object') {
    return { repaired: false, fixes: [], proposal };
  }
  
  const obj = proposal as Record<string, unknown>;
  
  // Deep clone to avoid mutation
  const fixed = JSON.parse(JSON.stringify(obj));
  
  // Fix view node types recursively
  function fixViewNode(node: unknown, path: string): void {
    if (!node || typeof node !== 'object') return;
    
    const n = node as Record<string, unknown>;
    
    // Fix type casing
    if (typeof n.type === 'string') {
      const lowerType = n.type.toLowerCase();
      const corrected = NODE_TYPE_CORRECTIONS[lowerType];
      if (corrected && n.type !== corrected) {
        fixes.push(`Fixed type casing at ${path}: "${n.type}" → "${corrected}"`);
        n.type = corrected;
      }
    }
    
    // Ensure children is an array if present
    if ('children' in n && n.children !== undefined && !Array.isArray(n.children)) {
      fixes.push(`Fixed children at ${path}: converted to array`);
      n.children = [];
    }
    
    // Recurse into children
    if (Array.isArray(n.children)) {
      n.children.forEach((child, i) => fixViewNode(child, `${path}.children[${i}]`));
    }
  }
  
  // Fix the view tree
  if (fixed.view) {
    fixViewNode(fixed.view, 'view');
  }
  
  return {
    repaired: fixes.length > 0,
    fixes,
    proposal: fixed,
  };
}

/**
 * Build feedback for AI self-correction when repair can't fix the issue
 */
export function buildRepairFeedback(
  issues: z.ZodIssue[],
  appliedFixes: string[]
): string {
  const lines = ['Your proposal had validation errors that could not be auto-repaired:'];
  
  if (appliedFixes.length > 0) {
    lines.push('', 'Auto-repaired issues:');
    appliedFixes.forEach(fix => lines.push(`  ✓ ${fix}`));
  }
  
  lines.push('', 'Remaining errors requiring your attention:');
  issues.forEach(issue => {
    const path = issue.path.join('.');
    lines.push(`  ✗ ${path}: ${issue.message}`);
  });
  
  lines.push('', 'Please fix these issues in your next response.');
  
  return lines.join('\n');
}
