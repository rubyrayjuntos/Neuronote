import { AppDefinition, PipelineDefinition, ViewNode } from '../types';
import { OPERATOR_REGISTRY } from '../constants';

/**
 * HONESTY ORACLE
 * 
 * Semantic analysis layer that compares user intent to proposed behavior.
 * Detects "valid but wrong" proposals where the AI generates syntactically
 * correct IR that doesn't match user intent.
 * 
 * This is Phase 3.5 of the Gatekeeper - a "semantic attack" detector.
 */

export interface IntentSignal {
  category: 'data_input' | 'data_output' | 'data_transform' | 'ui_display' | 'interaction' | 'unknown';
  keywords: string[];
  negations: string[];
}

export interface HonestyCheckResult {
  passed: boolean;
  confidence: number; // 0-1
  concerns: HonestyConcern[];
}

export interface HonestyConcern {
  severity: 'warning' | 'critical';
  type: 'intent_mismatch' | 'scope_creep' | 'undisclosed_output' | 'suspicious_binding' | 'data_exfiltration';
  message: string;
  evidence: Record<string, unknown>;
}

// ============================================================================
// INTENT EXTRACTION
// ============================================================================

const INTENT_PATTERNS: Record<IntentSignal['category'], { keywords: RegExp; negations: RegExp }> = {
  data_input: {
    keywords: /\b(upload|import|load|read|open|input|file|image|audio|paste)\b/i,
    negations: /\b(don'?t|no|without|remove|delete).{0,20}(upload|import|load|input)\b/i,
  },
  data_output: {
    keywords: /\b(save|export|download|send|share|output|write|copy)\b/i,
    negations: /\b(don'?t|no|without|remove|delete).{0,20}(save|export|download|send|share)\b/i,
  },
  data_transform: {
    keywords: /\b(convert|transform|filter|sort|map|process|analyze|calculate|count|sum|average)\b/i,
    negations: /\b(don'?t|no|without).{0,20}(convert|transform|process)\b/i,
  },
  ui_display: {
    keywords: /\b(show|display|view|render|present|visualize|chart|graph|list|table)\b/i,
    negations: /\b(don'?t|no|without|hide|remove).{0,20}(show|display|view)\b/i,
  },
  interaction: {
    keywords: /\b(click|button|toggle|switch|select|edit|modify|update|change)\b/i,
    negations: /\b(don'?t|no|without|disable|remove).{0,20}(click|button|edit)\b/i,
  },
  unknown: {
    keywords: /.*/,
    negations: /(?!)/,  // Never matches
  },
};

/**
 * Extract intent signals from user prompt.
 */
export function extractIntent(userPrompt: string): IntentSignal[] {
  const signals: IntentSignal[] = [];
  const promptLower = userPrompt.toLowerCase();

  for (const [category, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (category === 'unknown') continue;

    const keywordMatches = promptLower.match(patterns.keywords);
    const negationMatches = promptLower.match(patterns.negations);

    if (keywordMatches && keywordMatches.length > 0) {
      signals.push({
        category: category as IntentSignal['category'],
        keywords: keywordMatches,
        negations: negationMatches || [],
      });
    }
  }

  if (signals.length === 0) {
    signals.push({ category: 'unknown', keywords: [], negations: [] });
  }

  return signals;
}

// ============================================================================
// PROPOSAL BEHAVIOR ANALYSIS
// ============================================================================

interface ProposalBehavior {
  hasFileInput: boolean;
  hasExternalOutput: boolean;
  bindings: { source: string; target: string; type: 'context' | 'pipeline' | 'display' }[];
  pipelineComplexity: number;
  newContextKeys: string[];
  removedContextKeys: string[];
  sensitiveOperations: string[];
}

/**
 * Analyze what a proposed AppDefinition actually does.
 */
function analyzeProposalBehavior(
  proposal: AppDefinition,
  previous: AppDefinition
): ProposalBehavior {
  const behavior: ProposalBehavior = {
    hasFileInput: false,
    hasExternalOutput: false,
    bindings: [],
    pipelineComplexity: 0,
    newContextKeys: [],
    removedContextKeys: [],
    sensitiveOperations: [],
  };

  // Analyze view tree
  function walkView(node: ViewNode) {
    if (node.type === 'file-input') {
      behavior.hasFileInput = true;
    }

    if (node.valueBinding) {
      behavior.bindings.push({
        source: `view:${node.id}`,
        target: node.valueBinding,
        type: 'context',
      });
    }

    if (node.textBinding) {
      behavior.bindings.push({
        source: node.textBinding,
        target: `view:${node.id}`,
        type: 'display',
      });
    }

    node.children?.forEach(walkView);
  }

  walkView(proposal.view);

  // Analyze pipelines
  if (proposal.pipelines) {
    for (const [pipeId, pipe] of Object.entries(proposal.pipelines)) {
      behavior.pipelineComplexity += pipe.nodes.length;

      for (const node of pipe.nodes) {
        // Check for sensitive operations
        if (node.op.startsWith('Audio.') || node.op.startsWith('Image.')) {
          behavior.sensitiveOperations.push(node.op);
        }

        // Track pipeline bindings
        for (const input of Object.values(node.inputs)) {
          if (typeof input === 'string' && input.startsWith('$')) {
            behavior.bindings.push({
              source: input.slice(1),
              target: `pipeline:${pipeId}:${node.id}`,
              type: 'pipeline',
            });
          }
        }
      }
    }
  }

  // Analyze context changes
  const prevKeys = new Set(Object.keys(previous.initialContext));
  const newKeys = new Set(Object.keys(proposal.initialContext));

  for (const key of newKeys) {
    if (!prevKeys.has(key)) {
      behavior.newContextKeys.push(key);
    }
  }

  for (const key of prevKeys) {
    if (!newKeys.has(key)) {
      behavior.removedContextKeys.push(key);
    }
  }

  return behavior;
}

// ============================================================================
// HONESTY CHECKS
// ============================================================================

/**
 * Check: Did the user ask for file input, but proposal has none?
 * Or: Did user NOT ask for file input, but proposal added it?
 */
function checkFileInputAlignment(
  intent: IntentSignal[],
  behavior: ProposalBehavior
): HonestyConcern | null {
  const wantsInput = intent.some(s => s.category === 'data_input' && s.negations.length === 0);
  const noInput = intent.some(s => s.category === 'data_input' && s.negations.length > 0);

  if (wantsInput && !behavior.hasFileInput) {
    return {
      severity: 'warning',
      type: 'intent_mismatch',
      message: 'User requested data input capability, but proposal has no file-input element.',
      evidence: { wantsInput, hasFileInput: behavior.hasFileInput },
    };
  }

  if (!wantsInput && !noInput && behavior.hasFileInput && behavior.sensitiveOperations.length > 0) {
    return {
      severity: 'warning',
      type: 'scope_creep',
      message: 'Proposal adds file input with sensitive operations not explicitly requested.',
      evidence: { hasFileInput: true, sensitiveOperations: behavior.sensitiveOperations },
    };
  }

  return null;
}

/**
 * Check: Are there context keys being bound that seem unrelated to intent?
 */
function checkSuspiciousBindings(
  intent: IntentSignal[],
  behavior: ProposalBehavior,
  userPrompt: string
): HonestyConcern[] {
  const concerns: HonestyConcern[] = [];
  const promptLower = userPrompt.toLowerCase();

  // Check for context keys that don't appear anywhere in the prompt
  for (const key of behavior.newContextKeys) {
    const keyWords = key.toLowerCase().split(/[_\-\s]+/);
    const anyMatch = keyWords.some(word => word.length > 2 && promptLower.includes(word));

    if (!anyMatch && !['id', 'temp', 'tmp', 'result', 'output', 'value'].includes(key.toLowerCase())) {
      concerns.push({
        severity: 'warning',
        type: 'suspicious_binding',
        message: `New context key '${key}' has no apparent relation to user prompt.`,
        evidence: { key, promptSample: userPrompt.slice(0, 100) },
      });
    }
  }

  return concerns;
}

/**
 * Check: Is data flowing somewhere unexpected?
 */
function checkDataFlow(behavior: ProposalBehavior): HonestyConcern[] {
  const concerns: HonestyConcern[] = [];

  // Find all sources (inputs) and sinks (outputs)
  const sources = new Set<string>();
  const sinks = new Set<string>();

  for (const binding of behavior.bindings) {
    if (binding.type === 'context') {
      sources.add(binding.source);
    }
    if (binding.type === 'display') {
      sinks.add(binding.target);
    }
    if (binding.type === 'pipeline') {
      // Pipeline consumes from context
      sources.add(binding.source);
    }
  }

  // Check for sensitive data flowing to display without clear intent
  // This is a heuristic - in production you'd want ML-based classification
  const sensitivePatterns = /\b(password|secret|key|token|auth|private|credential)\b/i;

  for (const source of sources) {
    if (sensitivePatterns.test(source)) {
      for (const sink of sinks) {
        // If sensitive data is displayed, that's suspicious
        concerns.push({
          severity: 'critical',
          type: 'data_exfiltration',
          message: `Potentially sensitive context key '${source}' is being processed. Verify this is intended.`,
          evidence: { source, sinks: Array.from(sinks) },
        });
      }
    }
  }

  return concerns;
}

/**
 * Check: Complexity explosion - did a simple request produce complex pipelines?
 */
function checkComplexityAlignment(
  userPrompt: string,
  behavior: ProposalBehavior
): HonestyConcern | null {
  const promptWords = userPrompt.split(/\s+/).length;
  const complexityRatio = behavior.pipelineComplexity / Math.max(promptWords, 1);

  // Heuristic: more than 2 pipeline nodes per prompt word is suspicious
  if (complexityRatio > 2 && behavior.pipelineComplexity > 10) {
    return {
      severity: 'warning',
      type: 'scope_creep',
      message: `Proposal complexity (${behavior.pipelineComplexity} nodes) seems disproportionate to request length (${promptWords} words).`,
      evidence: { pipelineNodes: behavior.pipelineComplexity, promptWords, ratio: complexityRatio },
    };
  }

  return null;
}

// ============================================================================
// MAIN ORACLE FUNCTION
// ============================================================================

/**
 * Run the Honesty Oracle on a proposed AppDefinition.
 * 
 * @param userPrompt - The original user request
 * @param proposal - The AI-generated AppDefinition
 * @param previous - The previous AppDefinition (for delta analysis)
 * @returns HonestyCheckResult with pass/fail and concerns
 */
export function runHonestyOracle(
  userPrompt: string,
  proposal: AppDefinition,
  previous: AppDefinition
): HonestyCheckResult {
  const intent = extractIntent(userPrompt);
  const behavior = analyzeProposalBehavior(proposal, previous);
  const concerns: HonestyConcern[] = [];

  // Run all checks
  const fileCheck = checkFileInputAlignment(intent, behavior);
  if (fileCheck) concerns.push(fileCheck);

  concerns.push(...checkSuspiciousBindings(intent, behavior, userPrompt));
  concerns.push(...checkDataFlow(behavior));

  const complexityCheck = checkComplexityAlignment(userPrompt, behavior);
  if (complexityCheck) concerns.push(complexityCheck);

  // Calculate confidence score
  const criticalCount = concerns.filter(c => c.severity === 'critical').length;
  const warningCount = concerns.filter(c => c.severity === 'warning').length;

  // Confidence decreases with concerns
  const confidence = Math.max(0, 1 - (criticalCount * 0.3) - (warningCount * 0.1));

  // Pass if no critical concerns and confidence > 0.5
  const passed = criticalCount === 0 && confidence > 0.5;

  return {
    passed,
    confidence,
    concerns,
  };
}

/**
 * Format honesty concerns for display.
 */
export function formatHonestyReport(result: HonestyCheckResult): string {
  if (result.passed && result.concerns.length === 0) {
    return `✓ Honesty Oracle: PASSED (confidence: ${(result.confidence * 100).toFixed(0)}%)`;
  }

  const lines = [
    `${result.passed ? '⚠' : '✗'} Honesty Oracle: ${result.passed ? 'PASSED with warnings' : 'FAILED'} (confidence: ${(result.confidence * 100).toFixed(0)}%)`,
    '',
  ];

  for (const concern of result.concerns) {
    const icon = concern.severity === 'critical' ? '🚨' : '⚠️';
    lines.push(`${icon} [${concern.type}] ${concern.message}`);
  }

  return lines.join('\n');
}
