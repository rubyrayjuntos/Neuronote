import { AppDefinition, ViewNode, VerificationReport, CheckResult, TestVector, MachineDefinition } from '../types';

/**
 * 7. Verification & Trust Assurance
 * This module implements the 3-Phase Gatekeeper Pipeline.
 */

// --- PHASE A: STRUCTURAL VALIDATION ---

function validateStructure(node: ViewNode, errors: CheckResult[]) {
  const ALLOWED_TYPES = ['container', 'text', 'button', 'input', 'header', 'list', 'tabs', 'card'];
  
  if (!ALLOWED_TYPES.includes(node.type)) {
    errors.push({ 
      name: 'Component Whitelist', 
      status: 'FAIL', 
      message: `Invalid Component Type: '${node.type}'`,
      evidence: { nodeId: node.id, type: node.type },
      recommendedFix: `Change type to one of: ${ALLOWED_TYPES.join(', ')}`
    });
  }

  if (node.children) {
    node.children.forEach(child => validateStructure(child, errors));
  }
}

// --- PHASE B: SEMANTIC VALIDATION ---

function validateBindings(node: ViewNode, context: Record<string, any>, results: CheckResult[]) {
  // Check Text Bindings
  if (node.textBinding) {
    if (context[node.textBinding] === undefined) {
      results.push({ 
        name: 'Data Binding', 
        status: 'WARN', 
        message: `View binds to '${node.textBinding}', but it is missing from Initial Context.`,
        evidence: { nodeId: node.id, binding: node.textBinding },
        recommendedFix: `Add '${node.textBinding}' to initialContext.`
      });
    }
  }
  // Check Value Bindings
  if (node.valueBinding) {
    if (context[node.valueBinding] === undefined) {
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
    node.children.forEach(child => validateBindings(child, context, results));
  }
}

function validateEventWiring(view: ViewNode, machine: MachineDefinition, results: CheckResult[]) {
    // 1. Collect UI Events
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

    // 2. Collect Machine Events
    const machineEvents = new Set<string>();
    Object.values(machine.states).forEach(state => {
        if (state.on) {
            Object.keys(state.on).forEach(evt => machineEvents.add(evt));
        }
    });

    // 3. Compare (UI -> Machine Coverage)
    uiEvents.forEach(evt => {
        // UPDATE_CONTEXT is a host-level generic event
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

  // Check for Dead States (Islands)
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

// --- PHASE C: HONESTY CHECKS (Test Vectors) ---

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
      // Lightweight Simulation of Logic Engine
      let currentState = vector.initialState;
      let contextKeysChanged = new Set<string>();
      
      // Simulate Steps
      for (const step of vector.steps) {
        const stateDef = proposal.machine.states[currentState];
        if (!stateDef || !stateDef.on || !stateDef.on[step.event]) {
          throw new Error(`State '${currentState}' cannot handle event '${step.event}'`);
        }
        
        const transition = stateDef.on[step.event];
        const target = typeof transition === 'string' ? transition : transition.target;
        const actions = typeof transition === 'string' ? [] : (transition.actions || []);

        // Track Context Mutations (Simulated)
        actions.forEach(act => {
          const type = act.split(':')[0];
          const parts = act.split(':');
           if (type === 'SPAWN' && parts[2]) contextKeysChanged.add(parts[2]);
           if (type === 'APPEND' && parts[2]) contextKeysChanged.add(parts[2]);
           if (type === 'SET' && parts[1]) contextKeysChanged.add(parts[1]);
           if (type === 'TOGGLE' && parts[1]) contextKeysChanged.add(parts[1]);
        });

        if (target) currentState = target;
      }

      // Verify Expectations
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
             recommendedFix: `Add actions (SET, TOGGLE, etc) for ${missing.join(', ')} in the transition.`
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

  // 1. Structural
  validateStructure(proposal.view, report.checks.structural);
  if (report.checks.structural.length === 0) {
    report.checks.structural.push({ name: 'Schema Integrity', status: 'PASS', message: 'JSON Structure is valid.' });
  }

  // 2. Semantic
  validateBindings(proposal.view, proposal.initialContext, report.checks.semantic);
  validateEventWiring(proposal.view, proposal.machine, report.checks.semantic);
  validateReachability(proposal.machine, report.checks.semantic);

  // 3. Honesty
  executeTestVectors(proposal, report.checks.honesty);

  // Score Calculation
  const allChecks = [...report.checks.structural, ...report.checks.semantic, ...report.checks.honesty];
  const fails = allChecks.filter(c => c.status === 'FAIL').length;
  const warns = allChecks.filter(c => c.status === 'WARN').length;
  
  // Scoring
  let score = 100;
  if (fails > 0) score = 0;
  else score -= (warns * 10);
  
  report.score = Math.max(0, score);
  report.passed = fails === 0;

  return report;
}