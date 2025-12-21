/**
 * CAPABILITIES MANIFEST EXPORT
 * 
 * This module exports a JSON-serializable Capabilities Manifest that can be
 * consumed by ANY gateway (Python, Node, etc.) to validate actions BEFORE
 * calling the LLM.
 * 
 * This addresses the "Dual Schema Problem":
 * - Python Pydantic validates intent
 * - TypeScript Zod validates blueprint
 * - BOTH use THIS manifest as the shared source of truth
 * 
 * USAGE:
 * 1. Import and call generateCapabilitiesManifest() to get the full manifest
 * 2. Use canPerformAction() to check if an action is allowed on a target
 * 3. Export to /public/capabilities.json for Python gateway consumption
 */

import { OPERATOR_REGISTRY } from '../operators/registry';
import { TRACE_SCHEMA, TaintLevel } from './tracing';

// ============================================================================
// CAPABILITIES MANIFEST TYPES
// ============================================================================

/**
 * Supported actions that can be performed on primitives.
 */
export type PrimitiveAction = 
  | 'READ'      // Read data from this primitive
  | 'WRITE'     // Write data to this primitive
  | 'EXECUTE'   // Execute this primitive (operators)
  | 'BIND'      // Bind this primitive to another
  | 'COMPOSE'   // Compose with other primitives
  | 'UPDATE'    // Update properties of this primitive
  | 'DELETE';   // Remove this primitive

/**
 * Capability definition for a single primitive.
 */
export interface PrimitiveCapability {
  id: string;
  layer: 1 | 2 | 3;
  category: string;
  
  // What actions are allowed
  allowedActions: PrimitiveAction[];
  
  // What this primitive can connect to
  compatibleInputs?: string[];   // IDs of primitives that can feed into this
  compatibleOutputs?: string[];  // IDs of primitives this can feed into
  
  // Security properties
  immutable?: boolean;           // Cannot be modified after creation
  readOnly?: boolean;            // Can only read, not write
  requiresSanitization?: boolean; // Output must be sanitized before display
  maxTaintLevel?: TaintLevel;    // Maximum taint level this can handle
  
  // Execution constraints
  maxComplexity?: number;        // Maximum complexity score
  maxMemoryKb?: number;          // Maximum memory usage
  timeout?: number;              // Execution timeout in ms
}

/**
 * The complete Capabilities Manifest.
 * This is the "contract" between gateway and kernel.
 */
export interface CapabilitiesManifest {
  version: string;
  generatedAt: string;
  
  // The three layers
  layers: {
    layer1_io: PrimitiveCapability[];
    layer2_operators: PrimitiveCapability[];
    layer3_control: PrimitiveCapability[];
  };
  
  // Quick lookup maps
  byId: Record<string, PrimitiveCapability>;
  
  // Action validation rules
  globalRules: {
    maxPipelineComplexity: number;
    maxPipelineNodes: number;
    maxRecursionDepth: number;
    allowedEventNames: string[];
  };
  
  // Taint propagation rules
  taintRules: typeof TRACE_SCHEMA.taintLevels;
}

// ============================================================================
// LAYER 1: I/O PRIMITIVES
// ============================================================================

const LAYER1_CAPABILITIES: PrimitiveCapability[] = [
  // Input Primitives
  {
    id: 'Input.Image',
    layer: 1,
    category: 'Input',
    allowedActions: ['READ', 'BIND'],
    compatibleOutputs: ['Image.*', 'CV.*'],
    immutable: false,
    readOnly: true,
    maxTaintLevel: 2,
  },
  {
    id: 'Input.Audio',
    layer: 1,
    category: 'Input',
    allowedActions: ['READ', 'BIND'],
    compatibleOutputs: ['Audio.*'],
    immutable: false,
    readOnly: true,
    maxTaintLevel: 2,
  },
  {
    id: 'Input.Text',
    layer: 1,
    category: 'Input',
    allowedActions: ['READ', 'BIND'],
    compatibleOutputs: ['Text.*'],
    immutable: false,
    readOnly: true,
    maxTaintLevel: 2,
    requiresSanitization: true,
  },
  {
    id: 'Input.Slider',
    layer: 1,
    category: 'Input',
    allowedActions: ['READ', 'BIND', 'UPDATE'],
    compatibleOutputs: ['Math.*', 'Sanitizer.Clamp'],
    immutable: false,
    maxTaintLevel: 1,
  },
  {
    id: 'Input.Toggle',
    layer: 1,
    category: 'Input',
    allowedActions: ['READ', 'BIND', 'UPDATE'],
    compatibleOutputs: ['Logic.*'],
    immutable: false,
    maxTaintLevel: 0,
  },
  {
    id: 'Input.TextField',
    layer: 1,
    category: 'Input',
    allowedActions: ['READ', 'BIND', 'UPDATE'],
    compatibleOutputs: ['Text.*', 'Sanitizer.*'],
    immutable: false,
    maxTaintLevel: 2,
    requiresSanitization: true,
  },
  
  // Output Primitives
  {
    id: 'Output.Canvas',
    layer: 1,
    category: 'Output',
    allowedActions: ['WRITE', 'BIND'],
    compatibleInputs: ['Image.*', 'CV.*', 'Vector.*'],
    immutable: false,
    maxTaintLevel: 1,
  },
  {
    id: 'Output.Chart',
    layer: 1,
    category: 'Output',
    allowedActions: ['WRITE', 'BIND'],
    compatibleInputs: ['List.*', 'Math.*', 'Audio.FFT'],
    immutable: false,
    maxTaintLevel: 1,
  },
  {
    id: 'Output.Text',
    layer: 1,
    category: 'Output',
    allowedActions: ['WRITE', 'BIND'],
    compatibleInputs: ['Text.*', 'Sanitizer.Truncate'],
    immutable: false,
    maxTaintLevel: 2,
    requiresSanitization: true,
  },
  {
    id: 'Output.List',
    layer: 1,
    category: 'Output',
    allowedActions: ['WRITE', 'BIND'],
    compatibleInputs: ['List.*'],
    immutable: false,
    maxTaintLevel: 2,
    requiresSanitization: true,
  },
];

// ============================================================================
// LAYER 3: CONTROL PRIMITIVES
// ============================================================================

const LAYER3_CAPABILITIES: PrimitiveCapability[] = [
  {
    id: 'Control.Branch',
    layer: 3,
    category: 'Control',
    allowedActions: ['EXECUTE', 'COMPOSE'],
    maxComplexity: 1,
    maxTaintLevel: 1,
  },
  {
    id: 'Control.Gate',
    layer: 3,
    category: 'Control',
    allowedActions: ['EXECUTE', 'COMPOSE'],
    maxComplexity: 1,
    maxTaintLevel: 0,
  },
  {
    id: 'Control.Throttle',
    layer: 3,
    category: 'Control',
    allowedActions: ['EXECUTE', 'COMPOSE'],
    maxComplexity: 1,
    timeout: 5000,
    maxTaintLevel: 1,
  },
  {
    id: 'Control.Debounce',
    layer: 3,
    category: 'Control',
    allowedActions: ['EXECUTE', 'COMPOSE'],
    maxComplexity: 1,
    timeout: 2000,
    maxTaintLevel: 1,
  },
  {
    id: 'State.Set',
    layer: 3,
    category: 'State',
    allowedActions: ['EXECUTE'],
    maxComplexity: 1,
    maxTaintLevel: 2,
  },
  {
    id: 'State.Reset',
    layer: 3,
    category: 'State',
    allowedActions: ['EXECUTE'],
    maxComplexity: 1,
    maxTaintLevel: 0,
  },
  {
    id: 'Pipeline.Run',
    layer: 3,
    category: 'State',
    allowedActions: ['EXECUTE'],
    maxComplexity: 10,
    maxTaintLevel: 2,
  },
];

// ============================================================================
// LAYER 2: GENERATE FROM OPERATOR REGISTRY
// ============================================================================

function generateLayer2Capabilities(): PrimitiveCapability[] {
  return Object.entries(OPERATOR_REGISTRY).map(([opId, def]) => {
    // Determine compatible inputs based on operator inputs
    const compatibleInputs = def.inputs.map(input => {
      switch (input.type) {
        case 'image': return 'Image.*';
        case 'audio': return 'Audio.*';
        case 'array': return 'List.*';
        case 'string': return 'Text.*';
        case 'number': return 'Math.*';
        default: return '*';
      }
    });

    // Determine max taint level based on operator properties
    let maxTaintLevel: TaintLevel = 2;
    if (def.category === 'Sanitizer') {
      maxTaintLevel = 3; // Sanitizers can handle sensitive data
    } else if (def.pure && def.properties?.deterministic) {
      maxTaintLevel = 1; // Pure deterministic = low taint risk
    }

    return {
      id: opId,
      layer: 2 as const,
      category: def.category,
      allowedActions: ['EXECUTE', 'COMPOSE'] as PrimitiveAction[],
      compatibleInputs: [...new Set(compatibleInputs)],
      maxComplexity: def.properties?.complexity || 5,
      maxTaintLevel,
      requiresSanitization: def.properties?.outputTaint === 2,
    };
  });
}

// ============================================================================
// MANIFEST GENERATION
// ============================================================================

/**
 * Generate the complete Capabilities Manifest.
 * This is the shared source of truth between Python gateway and TypeScript kernel.
 */
export function generateCapabilitiesManifest(): CapabilitiesManifest {
  const layer2 = generateLayer2Capabilities();
  
  const allPrimitives = [
    ...LAYER1_CAPABILITIES,
    ...layer2,
    ...LAYER3_CAPABILITIES,
  ];
  
  // Build lookup map
  const byId: Record<string, PrimitiveCapability> = {};
  for (const prim of allPrimitives) {
    byId[prim.id] = prim;
  }
  
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    
    layers: {
      layer1_io: LAYER1_CAPABILITIES,
      layer2_operators: layer2,
      layer3_control: LAYER3_CAPABILITIES,
    },
    
    byId,
    
    globalRules: {
      maxPipelineComplexity: 50,
      maxPipelineNodes: 20,
      maxRecursionDepth: 5,
      allowedEventNames: [
        'CLICK', 'CHANGE', 'INPUT', 'SUBMIT',
        'FILE_SELECTED', 'VALUE_CHANGED', 'FILE_DROPPED',
        'TICK', 'TIMEOUT', 'COMPLETE',
      ],
    },
    
    taintRules: TRACE_SCHEMA.taintLevels,
  };
}

// ============================================================================
// ACTION VALIDATION
// ============================================================================

/**
 * Check if an action can be performed on a primitive.
 * This is what Python gateway should call BEFORE sending to LLM.
 */
export function canPerformAction(
  manifest: CapabilitiesManifest,
  primitiveId: string,
  action: PrimitiveAction
): { allowed: boolean; reason?: string } {
  const capability = manifest.byId[primitiveId];
  
  if (!capability) {
    return { allowed: false, reason: `Unknown primitive: ${primitiveId}` };
  }
  
  if (capability.immutable && (action === 'UPDATE' || action === 'DELETE')) {
    return { allowed: false, reason: `Primitive ${primitiveId} is immutable` };
  }
  
  if (capability.readOnly && action === 'WRITE') {
    return { allowed: false, reason: `Primitive ${primitiveId} is read-only` };
  }
  
  if (!capability.allowedActions.includes(action)) {
    return { 
      allowed: false, 
      reason: `Action ${action} not allowed on ${primitiveId}. Allowed: ${capability.allowedActions.join(', ')}` 
    };
  }
  
  return { allowed: true };
}

/**
 * Check if a data flow between two primitives is allowed.
 */
export function canConnect(
  manifest: CapabilitiesManifest,
  sourceId: string,
  targetId: string
): { allowed: boolean; reason?: string } {
  const source = manifest.byId[sourceId];
  const target = manifest.byId[targetId];
  
  if (!source) {
    return { allowed: false, reason: `Unknown source primitive: ${sourceId}` };
  }
  
  if (!target) {
    return { allowed: false, reason: `Unknown target primitive: ${targetId}` };
  }
  
  // Check taint level compatibility
  if (source.maxTaintLevel !== undefined && target.maxTaintLevel !== undefined) {
    if (source.maxTaintLevel > target.maxTaintLevel && !target.requiresSanitization) {
      return { 
        allowed: false, 
        reason: `Taint level mismatch: ${sourceId} (level ${source.maxTaintLevel}) cannot flow to ${targetId} (max level ${target.maxTaintLevel}) without sanitization` 
      };
    }
  }
  
  // Check category compatibility
  if (target.compatibleInputs) {
    const sourceCategory = source.category + '.*';
    const matches = target.compatibleInputs.some(pattern => 
      pattern === '*' || 
      pattern === sourceId || 
      pattern === sourceCategory ||
      sourceId.startsWith(pattern.replace('.*', '.'))
    );
    
    if (!matches) {
      return { 
        allowed: false, 
        reason: `${sourceId} is not compatible with ${targetId}. Expected: ${target.compatibleInputs.join(', ')}` 
      };
    }
  }
  
  return { allowed: true };
}

/**
 * Validate a complete pipeline against the manifest.
 */
export function validatePipeline(
  manifest: CapabilitiesManifest,
  nodes: { id: string; op: string; inputs: Record<string, string> }[]
): { valid: boolean; errors: string[]; totalComplexity: number } {
  const errors: string[] = [];
  let totalComplexity = 0;
  
  for (const node of nodes) {
    // Check operator exists
    const capability = manifest.byId[node.op];
    if (!capability) {
      errors.push(`Unknown operator: ${node.op}`);
      continue;
    }
    
    // Check action is allowed
    const actionCheck = canPerformAction(manifest, node.op, 'EXECUTE');
    if (!actionCheck.allowed) {
      errors.push(actionCheck.reason!);
    }
    
    // Accumulate complexity
    totalComplexity += capability.maxComplexity || 1;
  }
  
  // Check global limits
  if (totalComplexity > manifest.globalRules.maxPipelineComplexity) {
    errors.push(`Pipeline complexity ${totalComplexity} exceeds maximum ${manifest.globalRules.maxPipelineComplexity}`);
  }
  
  if (nodes.length > manifest.globalRules.maxPipelineNodes) {
    errors.push(`Pipeline has ${nodes.length} nodes, maximum is ${manifest.globalRules.maxPipelineNodes}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    totalComplexity,
  };
}
