import { AppDefinition, ViewNode, ChangeRecord, SessionMetrics } from '../types';

/**
 * 9.5 Quantitative Metrics Helpers
 */

function countNodes(node: ViewNode): number {
  let count = 1;
  if (node.children) {
    count += node.children.reduce((acc, child) => acc + countNodes(child), 0);
  }
  return count;
}

export function computeDiff(prev: AppDefinition, next: AppDefinition) {
  const prevNodes = countNodes(prev.view);
  const nextNodes = countNodes(next.view);

  const prevStates = Object.keys(prev.machine.states).length;
  const nextStates = Object.keys(next.machine.states).length;

  const prevKeys = Object.keys(prev.initialContext).length;
  const nextKeys = Object.keys(next.initialContext).length;

  return {
    uiNodes: nextNodes - prevNodes,
    states: nextStates - prevStates,
    dataKeys: nextKeys - prevKeys
  };
}

export function computeSessionMetrics(history: ChangeRecord[], interactionCount: number): SessionMetrics {
  const totalProposals = history.length;
  if (totalProposals === 0) {
    return {
      adoptionRate: 0,
      rollbackRate: 0,
      averageLatency: 0,
      totalInteractions: interactionCount,
      experimentCount: 0
    };
  }

  const accepted = history.filter(h => h.status === 'accepted').length;
  const rollbacks = history.filter(h => h.status === 'rolled_back').length;
  const totalLatency = history.reduce((acc, h) => acc + h.latencyMs, 0);

  return {
    adoptionRate: Math.round((accepted / totalProposals) * 100),
    rollbackRate: accepted > 0 ? Math.round((rollbacks / accepted) * 100) : 0,
    averageLatency: Math.round(totalLatency / totalProposals),
    totalInteractions: interactionCount,
    experimentCount: totalProposals
  };
}