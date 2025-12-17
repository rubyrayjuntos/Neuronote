import { AppDefinition, ViewNode, VerificationReport, CheckResult, TestVector, MachineDefinition, PipelineDefinition, PipelineNode } from '../types';
import { OPERATOR_REGISTRY, MAX_TREE_DEPTH, MAX_PIPELINE_NODES } from '../constants';

/**
 * 7. Verification & Trust Assurance
 * This module implements the 3-Phase Gatekeeper Pipeline.
 */

const OPCODES = ['SET', 'APPEND', 'RESET', 'TOGGLE', 'SPAWN', 'DELETE', 'ASSIGN', 'RUN'];

// THE STANDARD LIBRARY ALLOWLIST
const ALLOWED_OPS = Object.keys(OPERATOR_REGISTRY);

const SAFE_TAGS = [
    'div', 'span', 'p', 'article', 'section', 'main', 'aside', 'header', 'footer', 'nav',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'button', 'input', 'label', 'form', 
    'hr', 'br', 'pre', 'code', 'blockquote'
];

// DANGEROUS PROPS that could enable XSS or phishing attacks
const FORBIDDEN_PROPS = [
    'dangerouslySetInnerHTML',  // XSS vector
    'innerHTML',                 // XSS vector
    'outerHTML',                 // XSS vector
    'srcdoc',                    // iframe XSS
    'formAction',                // Form hijacking
    'action',                    // Form action hijacking
];

// Props that could be used for overlay/phishing attacks - BLOCKED (not warned)
const FORBIDDEN_STYLE_PROPS = [
    'position',     // fixed/absolute positioning for overlays
    'zIndex',       // Layer manipulation
    'z-index',      // CSS version
    'opacity',      // Hidden elements for exfiltration
    'visibility',   // Hidden elements
];

// Event handlers that shouldn't be string values (React ignores but still risky)
const EVENT_HANDLER_PATTERN = /^on[A-Z]/;

// URL validation: Only allow relative paths, data: for images from file-input, or explicit allowlist
const ALLOWED_URL_PATTERNS = [
    /^\/[^/]/,                          // Relative path starting with /
    /^\.?\.\//,                         // Relative path starting with ./ or ../
    /^#/,                               // Hash links
    /^data:image\/(png|jpeg|gif|webp|svg)/i,  // Data URLs for images only (from file-input)
];

// Tailwind arbitrary value syntax - potential CSS injection
const TAILWIND_ARBITRARY_PATTERN = /\[.*\]/;

// Tailwind classes that enable overlays or hidden content - BLOCKED
const FORBIDDEN_TAILWIND_CLASSES = [
    'fixed',        // Overlay positioning
    'absolute',     // Overlay positioning  
    'sticky',       // Can create overlays
    'inset-0',      // Full-screen overlay
    'inset-x-0',    // Horizontal overlay
    'inset-y-0',    // Vertical overlay
    'z-50', 'z-40', 'z-30', 'z-20', 'z-10',  // High z-index
    'opacity-0',    // Hidden content
    'invisible',    // Hidden content
    'hidden',       // Hidden content (though this just hides)
    'sr-only',      // Screen-reader only (hidden visually)
];

// --- PHASE A: STRUCTURAL VALIDATION ---

function validateStructure(node: ViewNode, errors: CheckResult[], depth: number = 0) {
  const ALLOWED_TYPES = [
      'container', 'text', 'button', 'input', 'header', 'list', 'tabs', 'card', 
      'element', 'icon', 'chart', 'clock',
      'file-input', 'slider', 'canvas',
      'text-input', 'text-display',
      // HOST PRIMITIVES for controlled overlays (safe alternatives)
      'modal', 'toast', 'dropdown', 'tooltip', 'popover'
  ];
  
  if (depth > MAX_TREE_DEPTH) {
      errors.push({
          name: 'Recursion Limit',
          status: 'FAIL',
          message: `Maximum component depth exceeded (${depth}).`,
          evidence: { nodeId: node.id, depth },
          recommendedFix: 'Flatten the UI structure.'
      });
      return; 
  }

  if (!ALLOWED_TYPES.includes(node.type)) {
    errors.push({ 
      name: 'Component Whitelist', 
      status: 'FAIL', 
      message: `Invalid Component Type: '${node.type}'`,
      evidence: { nodeId: node.id, type: node.type },
      recommendedFix: `Change type to one of: ${ALLOWED_TYPES.join(', ')}`
    });
  }

  if (node.type === 'element') {
      if (!node.tag) {
          // Default valid
      } else if (!SAFE_TAGS.includes(node.tag)) {
          errors.push({
              name: 'HTML Tag Safety',
              status: 'FAIL',
              message: `Forbidden HTML Tag: '${node.tag}'`,
              evidence: { nodeId: node.id, tag: node.tag },
              recommendedFix: `Use a safe tag: ${SAFE_TAGS.slice(0, 10).join(', ')}...`
          });
      }
  }

  const clickHandler = node.onClick;
  if (clickHandler && OPCODES.some(op => clickHandler.startsWith(op + ':'))) {
      errors.push({
          name: 'Separation of Concerns',
          status: 'FAIL',
          message: `UI Event '${node.onClick}' looks like an Action Opcode.`,
          evidence: { nodeId: node.id, event: node.onClick },
          recommendedFix: `Rename event to a verb (e.g., 'ADD_ITEM') and define the '${node.onClick}' logic inside the Machine.`
      });
  }

  // PROP SANITIZATION - Check for dangerous props
  if (node.props) {
    validateProps(node.id, node.props, errors);
  }

  if (node.children) {
    node.children.forEach(child => validateStructure(child, errors, depth + 1));
  }
}

/**
 * Validate props for security risks.
 * Checks for XSS vectors, overlay attacks, and data exfiltration.
 * 
 * Security Model:
 * - FAIL on any prop that could enable XSS, phishing, or data exfiltration
 * - Block all external URLs (relative paths only, or data: for images)
 * - Block Tailwind arbitrary values (CSS injection vector)
 * - Block positioning/visibility that could create overlays or hidden elements
 * - Use Host primitives (modal, toast, etc.) for controlled overlay patterns
 */
function validateProps(nodeId: string, props: Record<string, unknown>, errors: CheckResult[]) {
  for (const [key, value] of Object.entries(props)) {
    // 1. Forbidden props (XSS vectors)
    if (FORBIDDEN_PROPS.includes(key)) {
      errors.push({
        name: 'Prop Security',
        status: 'FAIL',
        message: `Forbidden prop '${key}' on node '${nodeId}'. This is a potential XSS vector.`,
        evidence: { nodeId, prop: key },
        recommendedFix: `Remove '${key}' prop. Use textBinding for dynamic content.`
      });
    }

    // 2. Event handlers as strings (potential XSS)
    if (EVENT_HANDLER_PATTERN.test(key) && typeof value === 'string') {
      errors.push({
        name: 'Event Handler Security',
        status: 'FAIL',
        message: `Event handler '${key}' on node '${nodeId}' has string value. This could be an XSS attempt.`,
        evidence: { nodeId, prop: key, value },
        recommendedFix: `Use 'onClick' or 'onChange' bindings instead of inline handlers.`
      });
    }

    // 3. URL validation: Block external URLs (relative paths only)
    if ((key === 'href' || key === 'src') && typeof value === 'string') {
      const isAllowed = ALLOWED_URL_PATTERNS.some(pattern => pattern.test(value));
      if (!isAllowed && value.length > 0) {
        errors.push({
          name: 'URL Security',
          status: 'FAIL',
          message: `External URL blocked in '${key}' on node '${nodeId}'. Only relative paths allowed.`,
          evidence: { nodeId, prop: key, value: value.substring(0, 80) },
          recommendedFix: `Use relative paths (e.g., '/images/logo.png') or data URLs from file-input.`
        });
      }
    }

    // 4. Style object: Block positioning and visibility properties
    if (key === 'style' && typeof value === 'object' && value !== null) {
      const styleObj = value as Record<string, unknown>;
      for (const styleProp of FORBIDDEN_STYLE_PROPS) {
        if (styleProp in styleObj) {
          errors.push({
            name: 'Style Security',
            status: 'FAIL',
            message: `Forbidden style property '${styleProp}' on node '${nodeId}'. Use Host primitives (modal, toast) for overlays.`,
            evidence: { nodeId, style: styleProp, value: styleObj[styleProp] },
            recommendedFix: `Remove '${styleProp}' from style. Use 'modal' or 'toast' type for overlay UI.`
          });
        }
      }
    }

    // 5. Tailwind className validation
    if (key === 'className' && typeof value === 'string') {
      // 5a. Block arbitrary values (CSS injection vector)
      if (TAILWIND_ARBITRARY_PATTERN.test(value)) {
        const matches = value.match(/\[[^\]]+\]/g) || [];
        errors.push({
          name: 'Class Security',
          status: 'FAIL',
          message: `Tailwind arbitrary values blocked on node '${nodeId}': ${matches.join(', ')}`,
          evidence: { nodeId, className: value, arbitraryValues: matches },
          recommendedFix: `Use standard Tailwind classes only. Arbitrary values like [color:red] can inject CSS.`
        });
      }

      // 5b. Block forbidden positioning/visibility classes
      const classes = value.split(/\s+/);
      const forbidden = classes.filter(cls => 
        FORBIDDEN_TAILWIND_CLASSES.some(fc => cls === fc || cls.startsWith(fc + '-'))
      );
      if (forbidden.length > 0) {
        errors.push({
          name: 'Class Security',
          status: 'FAIL',
          message: `Forbidden Tailwind classes on node '${nodeId}': ${forbidden.join(', ')}`,
          evidence: { nodeId, forbiddenClasses: forbidden },
          recommendedFix: `Remove positioning/visibility classes. Use 'modal', 'toast', or 'popover' type for overlay UI.`
        });
      }
    }
  }
}

function validatePipelines(pipelines: Record<string, PipelineDefinition> | undefined, errors: CheckResult[]) {
    if (!pipelines) return;

    Object.entries(pipelines).forEach(([pid, pipe]) => {
        // 1. Graph Bomb Check
        if (pipe.nodes.length > MAX_PIPELINE_NODES) {
             errors.push({
                name: `Pipeline Budget (${pid})`,
                status: 'FAIL',
                message: `Pipeline exceeds node limit (${pipe.nodes.length} > ${MAX_PIPELINE_NODES}).`,
                recommendedFix: 'Optimize pipeline or split into sub-tasks.'
            });
            return;
        }

        const nodeMap = new Map<string, PipelineNode>();
        const nodeIds = new Set<string>();
        const adjacency: Record<string, string[]> = {};

        pipe.nodes.forEach(n => {
            if (nodeIds.has(n.id)) {
                errors.push({
                    name: `Pipeline Integrity (${pid})`,
                    status: 'FAIL',
                    message: `Duplicate Node ID '${n.id}' in pipeline.`,
                    recommendedFix: 'Ensure all pipeline nodes have unique IDs.'
                });
            }
            nodeIds.add(n.id);
            nodeMap.set(n.id, n);
            adjacency[n.id] = [];
            
            if (!ALLOWED_OPS.includes(n.op)) {
                 errors.push({
                    name: `Op Allowlist (${pid})`,
                    status: 'FAIL',
                    message: `Operator '${n.op}' is not authorized.`,
                    evidence: { nodeId: n.id, op: n.op },
                    recommendedFix: `Use one of: ${ALLOWED_OPS.join(', ')}`
                });
            }
        });

        // 2. Wiring, Cycle Detection & TYPE CHECKING
        pipe.nodes.forEach(n => {
            const opSchema = OPERATOR_REGISTRY[n.op];
            if (!opSchema) return; // Already flagged as invalid op

            Object.entries(n.inputs).forEach(([idxStr, ref]) => {
                const inputIdx = parseInt(idxStr);
                // Input Type Check
                const expectedInput = opSchema.inputs[inputIdx];
                if (!expectedInput) {
                     // Extra input ignored, or warn?
                     return;
                }

                if (typeof ref === 'string' && ref.startsWith('@')) {
                    const targetId = ref.substring(1).split('.')[0];
                    
                    if (!nodeIds.has(targetId)) {
                        errors.push({
                            name: `Pipeline Wiring (${pid})`,
                            status: 'FAIL',
                            message: `Node '${n.id}' references non-existent node '${targetId}'.`,
                            recommendedFix: 'Check input references.'
                        });
                    } else {
                        // Edge: Target -> Node
                        adjacency[targetId].push(n.id);

                        // --- STRICT TYPE CHECK ---
                        const targetNode = nodeMap.get(targetId);
                        if (targetNode) {
                            const targetOp = OPERATOR_REGISTRY[targetNode.op];
                            if (targetOp) {
                                const outputType = targetOp.output;
                                const inputType = expectedInput.type;
                                
                                // Loose compatibility for 'any' type
                                const compatible = outputType === inputType || outputType === 'any' || inputType === 'any';
                                if (!compatible) {
                                    errors.push({
                                        name: `Type Safety (${pid})`,
                                        status: 'FAIL',
                                        message: `Type Mismatch at '${n.id}' input ${inputIdx}. Expected '${inputType}', got '${outputType}' from '${targetId}'.`,
                                        evidence: { source: targetId, target: n.id, expected: inputType, actual: outputType },
                                        recommendedFix: `Connect a compatible node or convert type.`
                                    });
                                }
                            }
                        }
                    }

                    if (targetId === n.id) {
                         errors.push({
                            name: `Pipeline Cycle (${pid})`,
                            status: 'FAIL',
                            message: `Node '${n.id}' references itself.`,
                            recommendedFix: 'Remove self-reference.'
                        });
                    }
                } else if (typeof ref === 'string' && ref.startsWith('$')) {
                    // Context Input Binding Check
                    const contextKey = ref.substring(1);
                    const declaredType = pipe.inputs[contextKey];
                    if (!declaredType) {
                        errors.push({
                            name: `Pipeline Interface (${pid})`,
                            status: 'WARN',
                            message: `Node '${n.id}' consumes context key '${contextKey}' which is not declared in pipeline 'inputs'.`,
                            recommendedFix: `Add '${contextKey}' to pipeline.inputs definition.`
                        });
                    } else {
                         // Type check against declared context input
                         const inputType = expectedInput.type;
                         const compatible = declaredType === inputType || declaredType === 'any' || inputType === 'any';
                         if (!compatible) {
                             errors.push({
                                name: `Type Safety (${pid})`,
                                status: 'FAIL',
                                message: `Type Mismatch at '${n.id}' input ${inputIdx}. Context key '${contextKey}' is '${declaredType}', op expects '${inputType}'.`,
                            });
                         }
                    }
                }
            });
        });

        // 3. Cycle Detection (DFS)
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        function hasCycle(nodeId: string): boolean {
            if (recursionStack.has(nodeId)) return true;
            if (visited.has(nodeId)) return false;

            visited.add(nodeId);
            recursionStack.add(nodeId);

            const neighbors = adjacency[nodeId] || [];
            for (const neighbor of neighbors) {
                if (hasCycle(neighbor)) return true;
            }

            recursionStack.delete(nodeId);
            return false;
        }

        // Run DFS from all nodes
        for (const nodeId of nodeIds) {
            if (hasCycle(nodeId)) {
                errors.push({
                    name: `Pipeline Cycle Detected (${pid})`,
                    status: 'FAIL',
                    message: `Cycle detected involving node '${nodeId}'.`,
                    recommendedFix: 'Pipelines must be Acyclic (DAGs). Break the loop.'
                });
                break; // One cycle is enough to fail
            }
        }
        
        if (pipe.output && !nodeIds.has(pipe.output)) {
             errors.push({
                name: `Pipeline Output (${pid})`,
                status: 'FAIL',
                message: `Pipeline output references missing node '${pipe.output}'.`,
            });
        }
    });
}

// ... (Rest of validator.ts checks)
function validateBindings(node: ViewNode, context: Record<string, any>, results: CheckResult[], isScoped = false) {
  // CRITICAL FIX: Guard against undefined context to prevent crash on property access
  const ctx = context || {};

  if (node.textBinding) {
    if (!isScoped && ctx[node.textBinding] === undefined) {
      results.push({ 
        name: 'Data Binding', 
        status: 'WARN', 
        message: `View binds to '${node.textBinding}', but it is missing from Initial Context.`,
        evidence: { nodeId: node.id, binding: node.textBinding },
        recommendedFix: `Add '${node.textBinding}' to initialContext.`
      });
    }
  }
  if (node.valueBinding) {
    if (node.type === 'list') {
         results.push({
             name: 'Semantic Convention',
             status: 'WARN',
             message: 'Lists should use "textBinding" for their data source, not "valueBinding".',
             evidence: { nodeId: node.id },
             recommendedFix: 'Move the binding key to "textBinding".'
         });
    }

    if (!isScoped && ctx[node.valueBinding] === undefined) {
      results.push({ 
        name: 'Data Binding', 
        status: 'WARN', 
        message: `Input binds to '${node.valueBinding}', but it is missing from Initial Context.`,
        evidence: { nodeId: node.id, binding: node.valueBinding },
        recommendedFix: `Add '${node.valueBinding}' to initialContext.`
      });
    }
  }
  
  if (node.children) {
    const nextIsScoped = isScoped || node.type === 'list';
    node.children.forEach(child => validateBindings(child, ctx, results, nextIsScoped));
  }
}

function validateActionHazards(machine: MachineDefinition, results: CheckResult[]) {
    Object.entries(machine.states).forEach(([stateName, stateDef]) => {
        if (!stateDef.on) return;
        Object.entries(stateDef.on).forEach(([eventName, transition]) => {
            if (typeof transition === 'string') return;
            if (!transition.actions) return;
            
            const resetKeys = new Set<string>();
            transition.actions.forEach((action, index) => {
                const parts = action.split(':');
                const opcode = parts[0];
                
                if (opcode === 'RESET') {
                    resetKeys.add(parts[1]);
                } else if (opcode === 'APPEND' || opcode === 'SPAWN') {
                    const source = parts[1];
                    if (resetKeys.has(source)) {
                        results.push({
                            name: 'Logic Hazard (Race Condition)',
                            status: 'FAIL',
                            message: `Action Hazard in state '${stateName}' on '${eventName}': '${source}' is RESET before it is used in ${opcode}.`,
                            evidence: { actions: transition.actions },
                            recommendedFix: `Reorder actions: perform ${opcode} BEFORE Resetting '${source}'.`
                        });
                    }
                }
            });
        });
    });
}

function validateMachineIntegrity(machine: MachineDefinition, results: CheckResult[]) {
    Object.entries(machine.states).forEach(([stateName, stateDef]) => {
        if (!stateDef.on) return;
        Object.keys(stateDef.on).forEach(eventName => {
            const potentialOpcode = eventName.split(':')[0];
            if (OPCODES.includes(potentialOpcode)) {
                 results.push({
                    name: 'Protocol Violation',
                    status: 'FAIL',
                    message: `Event '${eventName}' in state '${stateName}' appears to be an Action Opcode. Events must be abstract signals (e.g., 'ADD_ITEM'), not direct commands.`,
                    evidence: { state: stateName, invalidEvent: eventName },
                    recommendedFix: `Rename '${eventName}' to a semantic event name and move the logic to the 'actions' array.`
                });
            }
        });
    });
}

function validateEventWiring(view: ViewNode, machine: MachineDefinition, results: CheckResult[]) {
    const uiEvents = new Set<string>();
    const nodeEventMap: Record<string, string> = {};

    function traverse(node: ViewNode) {
        if (node.onClick) {
            uiEvents.add(node.onClick);
            nodeEventMap[node.onClick] = node.id;
        }
        if (node.onChange) {
            uiEvents.add(node.onChange);
            nodeEventMap[node.onChange] = node.id;
        }
        node.children?.forEach(traverse);
    }
    traverse(view);

    const machineEvents = new Set<string>();
    Object.values(machine.states).forEach(state => {
        if (state.on) {
            Object.keys(state.on).forEach(evt => machineEvents.add(evt));
        }
    });

    uiEvents.forEach(evt => {
        if (evt.startsWith('UPDATE_CONTEXT')) return;
        if (!machineEvents.has(evt)) {
             results.push({
                name: 'Event Wiring',
                status: 'FAIL',
                message: `UI triggers event '${evt}', but no state handles it.`,
                evidence: { event: evt, sourceNodeId: nodeEventMap[evt] },
                recommendedFix: `Add a transition for '${evt}' in the machine definition.`
            });
        }
    });
}

function validateReachability(machine: any, results: CheckResult[]) {
  const definedStates = new Set(Object.keys(machine.states));
  const reachable = new Set<string>([machine.initial]);
  const queue = [machine.initial];
  const missingTargets = new Set<string>();

  if (!definedStates.has(machine.initial)) {
    results.push({ 
      name: 'Initial State', 
      status: 'FAIL', 
      message: `Initial state '${machine.initial}' is not defined.`,
      evidence: { initial: machine.initial },
      recommendedFix: `Define the state '${machine.initial}' in 'states' object.`
    });
    return;
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const stateDef = machine.states[current];
    
    if (stateDef && stateDef.on) {
      Object.values(stateDef.on).forEach((transition: any) => {
        const target = typeof transition === 'string' ? transition : transition.target;
        if (target) {
          if (!definedStates.has(target)) {
            missingTargets.add(target);
          } else if (!reachable.has(target)) {
            reachable.add(target);
            queue.push(target);
          }
        }
      });
    }
  }

  const unreachable = [...definedStates].filter(s => !reachable.has(s));
  if (unreachable.length > 0) {
    results.push({ 
      name: 'State Reachability', 
      status: 'WARN', 
      message: `Unreachable states found: ${unreachable.join(', ')}`,
      evidence: { unreachableStates: unreachable },
      recommendedFix: `Add transitions that target these states or remove them.`
    });
  }

  if (missingTargets.size > 0) {
    results.push({ 
      name: 'Transition Validity', 
      status: 'FAIL', 
      message: `Transitions point to undefined states: ${Array.from(missingTargets).join(', ')}`,
      evidence: { missingStates: Array.from(missingTargets) },
      recommendedFix: `Define the missing states: ${Array.from(missingTargets).join(', ')}`
    });
  } else {
    results.push({ name: 'Graph Integrity', status: 'PASS', message: 'All transitions are valid.' });
  }
}

// --- PHASE C: HONESTY CHECKS ---

function executeTestVectors(proposal: AppDefinition, results: CheckResult[]) {
  if (!proposal.testVectors || proposal.testVectors.length === 0) {
    results.push({ 
      name: 'Proof of Behavior', 
      status: 'WARN', 
      message: 'No Test Vectors provided. Feature honesty cannot be verified.',
      recommendedFix: 'Ask AI to include `testVectors` in response.'
    });
    return;
  }

  proposal.testVectors.forEach(vector => {
    try {
      let currentState = vector.initialState;
      let contextKeysChanged = new Set<string>();
      
      for (const step of vector.steps) {
        const opcode = step.event.split(':')[0];
        if (OPCODES.includes(opcode)) {
             throw new Error(`Invalid Vector Event '${step.event}'. Test Vectors must trigger Machine Events (keys in 'states.on'), NOT Action Opcodes.`);
        }

        if (step.event.startsWith('UPDATE_CONTEXT')) {
            const parts = step.event.split(':');
            const key = parts[1];
            if (key) contextKeysChanged.add(key);
            continue; 
        }

        if (step.event === 'TICK') {
            const stateDef = proposal.machine.states[currentState];
            if (stateDef && stateDef.on && stateDef.on['TICK']) {
                const trans = stateDef.on['TICK'];
                const acts = typeof trans === 'string' ? [] : (trans.actions || []);
                acts.forEach(a => {
                    if (a.startsWith('ASSIGN:')) contextKeysChanged.add(a.split(':')[1]);
                });
            }
            continue;
        }

        const stateDef = proposal.machine.states[currentState];
        if (!stateDef || !stateDef.on || !stateDef.on[step.event]) {
          throw new Error(`State '${currentState}' cannot handle event '${step.event}'.`);
        }
        
        const transition = stateDef.on[step.event];
        const target = typeof transition === 'string' ? transition : transition.target;
        const actions = typeof transition === 'string' ? [] : (transition.actions || []);

        actions.forEach(act => {
          const type = act.split(':')[0];
          const parts = act.split(':');
           if (type === 'SPAWN' && parts[2]) contextKeysChanged.add(parts[2]);
           if (type === 'APPEND' && parts[2]) contextKeysChanged.add(parts[2]);
           if (type === 'SET' && parts[1]) contextKeysChanged.add(parts[1]);
           if (type === 'ASSIGN' && parts[1]) contextKeysChanged.add(parts[1]);
           if (type === 'TOGGLE' && parts[1]) contextKeysChanged.add(parts[1]);
           if (type === 'RUN' && parts[2]) contextKeysChanged.add(parts[2]); // RUN updates context with result
        });

        if (target) currentState = target;
      }

      const lastStep = vector.steps[vector.steps.length - 1];
      if (lastStep.expectState && currentState !== lastStep.expectState) {
        results.push({ 
          name: `Vector: ${vector.name}`, 
          status: 'FAIL', 
          message: `Expected state '${lastStep.expectState}', got '${currentState}'`,
          evidence: { expected: lastStep.expectState, actual: currentState, vector: vector },
          recommendedFix: `Ensure logic flow transitions to '${lastStep.expectState}' on event '${lastStep.event}'.`
        });
      } else if (lastStep.expectContextKeys) {
        const missing = lastStep.expectContextKeys.filter(k => !contextKeysChanged.has(k));
        if (missing.length > 0) {
           results.push({ 
             name: `Vector: ${vector.name}`, 
             status: 'FAIL', 
             message: `Expected context changes in [${missing.join(', ')}] but they were not modified.`,
             evidence: { missingKeys: missing },
             recommendedFix: `Add actions (SET, RUN, etc) for ${missing.join(', ')} in the transition.`
           });
        } else {
           results.push({ name: `Vector: ${vector.name}`, status: 'PASS', message: 'Behavior verified.' });
        }
      } else {
        results.push({ name: `Vector: ${vector.name}`, status: 'PASS', message: 'Trace executed successfully.' });
      }

    } catch (e: any) {
      results.push({ 
        name: `Vector: ${vector.name}`, 
        status: 'FAIL', 
        message: `Simulation Error: ${e.message}`,
        evidence: { error: e.message },
        recommendedFix: 'Check event names and state definitions.'
      });
    }
  });
}

// --- MAIN VALIDATOR ---

export async function verifyProposal(proposal: AppDefinition): Promise<VerificationReport> {
  const report: VerificationReport = {
    timestamp: Date.now(),
    passed: false,
    score: 0,
    checks: {
      structural: [],
      semantic: [],
      honesty: []
    }
  };

  try {
      // 1. Structural
      validateStructure(proposal.view, report.checks.structural);
      validatePipelines(proposal.pipelines, report.checks.structural);
      
      if (report.checks.structural.length === 0) {
        report.checks.structural.push({ name: 'Schema Integrity', status: 'PASS', message: 'JSON Structure is valid.' });
      }

      // 2. Semantic
      validateBindings(proposal.view, proposal.initialContext, report.checks.semantic);
      validateEventWiring(proposal.view, proposal.machine, report.checks.semantic);
      validateMachineIntegrity(proposal.machine, report.checks.semantic); 
      validateReachability(proposal.machine, report.checks.semantic);
      validateActionHazards(proposal.machine, report.checks.semantic);

      // 3. Honesty
      executeTestVectors(proposal, report.checks.honesty);
  } catch (e: any) {
      report.checks.structural.push({
          name: 'Validator Crash',
          status: 'FAIL',
          message: `Validator crashed: ${e.message}`
      });
  }

  const allChecks = [...report.checks.structural, ...report.checks.semantic, ...report.checks.honesty];
  const fails = allChecks.filter(c => c.status === 'FAIL').length;
  const warns = allChecks.filter(c => c.status === 'WARN').length;
  
  let score = 100;
  if (fails > 0) score = 0;
  else score -= (warns * 10);
  
  report.score = Math.max(0, score);
  report.passed = fails === 0;

  return report;
}