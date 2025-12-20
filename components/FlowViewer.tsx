/**
 * FlowViewer Component
 * 
 * Provides 100% transparency into AI interaction flows.
 * Designed for research validation - every phase is visible and inspectable.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Activity, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  ChevronDown, 
  ChevronRight,
  Eye,
  EyeOff,
  Download,
  Trash2,
  Zap,
  Brain,
  Shield,
  GitMerge,
  Play,
  Layers
} from 'lucide-react';
import { 
  ObservabilityService, 
  AIFlowTrace, 
  FlowEvent, 
  FlowPhase 
} from '../services/observability';

interface FlowViewerProps {
  /** Compact mode for sidebar display */
  compact?: boolean;
  /** Maximum height before scrolling */
  maxHeight?: string;
}

/**
 * Phase metadata for display
 */
const PHASE_META: Record<FlowPhase, { 
  label: string; 
  icon: React.ReactNode; 
  color: string;
  description: string;
}> = {
  'PROMPT_RECEIVED': {
    label: 'Prompt Received',
    icon: <Play className="w-3 h-3" />,
    color: 'text-blue-400',
    description: 'User input captured'
  },
  'CONTEXT_ASSEMBLED': {
    label: 'Context Assembled',
    icon: <Layers className="w-3 h-3" />,
    color: 'text-blue-400',
    description: 'Current state and feedback gathered'
  },
  'SYSTEM_PROMPT_BUILT': {
    label: 'System Prompt Built',
    icon: <Brain className="w-3 h-3" />,
    color: 'text-purple-400',
    description: 'Full prompt constructed for AI'
  },
  'AI_REQUEST_SENT': {
    label: 'AI Request Sent',
    icon: <Zap className="w-3 h-3" />,
    color: 'text-yellow-400',
    description: 'Request dispatched to AI provider'
  },
  'AI_RESPONSE_RECEIVED': {
    label: 'AI Response Received',
    icon: <Zap className="w-3 h-3" />,
    color: 'text-yellow-400',
    description: 'Raw response from AI'
  },
  'RESPONSE_PARSED': {
    label: 'Response Parsed',
    icon: <Layers className="w-3 h-3" />,
    color: 'text-cyan-400',
    description: 'JSON parsed from response'
  },
  'VALIDATION_STARTED': {
    label: 'Validation Started',
    icon: <Shield className="w-3 h-3" />,
    color: 'text-indigo-400',
    description: 'Verification pipeline begins'
  },
  'VALIDATION_STRUCTURAL': {
    label: 'Structural Checks',
    icon: <Shield className="w-3 h-3" />,
    color: 'text-indigo-400',
    description: 'Schema and structure validation'
  },
  'VALIDATION_SEMANTIC': {
    label: 'Semantic Checks',
    icon: <Shield className="w-3 h-3" />,
    color: 'text-indigo-400',
    description: 'Logic and consistency validation'
  },
  'VALIDATION_HONESTY': {
    label: 'Honesty Oracle',
    icon: <Eye className="w-3 h-3" />,
    color: 'text-orange-400',
    description: 'Semantic attack detection'
  },
  'VALIDATION_COMPLETE': {
    label: 'Validation Complete',
    icon: <Shield className="w-3 h-3" />,
    color: 'text-indigo-400',
    description: 'All verification done'
  },
  'MIGRATION_COMPUTED': {
    label: 'Migration Computed',
    icon: <GitMerge className="w-3 h-3" />,
    color: 'text-teal-400',
    description: 'Context migration calculated'
  },
  'LENS_LAWS_VERIFIED': {
    label: 'Lens Laws Verified',
    icon: <CheckCircle2 className="w-3 h-3" />,
    color: 'text-emerald-400',
    description: 'Bidirectional integrity confirmed'
  },
  'PROPOSAL_APPLIED': {
    label: 'Proposal Applied',
    icon: <CheckCircle2 className="w-3 h-3" />,
    color: 'text-emerald-400',
    description: 'New definition activated'
  },
  'FLOW_COMPLETE': {
    label: 'Flow Complete',
    icon: <CheckCircle2 className="w-3 h-3" />,
    color: 'text-emerald-400',
    description: 'Full cycle done'
  },
  'FLOW_ERROR': {
    label: 'Flow Error',
    icon: <XCircle className="w-3 h-3" />,
    color: 'text-rose-400',
    description: 'Error occurred'
  }
};

/**
 * Format milliseconds as human readable
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

/**
 * Truncate string with ellipsis
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '...';
}

/**
 * Single trace card component
 */
const TraceCard: React.FC<{ 
  trace: AIFlowTrace; 
  expanded: boolean;
  onToggle: () => void;
}> = ({ trace, expanded, onToggle }) => {
  const [showRaw, setShowRaw] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  
  const statusIcon = trace.status === 'success' 
    ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
    : trace.status === 'rejected'
    ? <AlertTriangle className="w-4 h-4 text-amber-500" />
    : trace.status === 'error'
    ? <XCircle className="w-4 h-4 text-rose-500" />
    : <Activity className="w-4 h-4 text-blue-500 animate-pulse" />;
    
  const statusColor = trace.status === 'success' 
    ? 'border-emerald-900/50 bg-emerald-950/20'
    : trace.status === 'rejected'
    ? 'border-amber-900/50 bg-amber-950/20'
    : trace.status === 'error'
    ? 'border-rose-900/50 bg-rose-950/20'
    : 'border-blue-900/50 bg-blue-950/20';

  return (
    <div className={`border rounded-lg ${statusColor} overflow-hidden`}>
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
          {statusIcon}
          <div>
            <div className="text-sm font-medium text-zinc-200 truncate max-w-[300px]">
              {truncate(trace.userPrompt, 50)}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
              <span>{trace.provider}/{trace.model}</span>
              <span>•</span>
              <span>{new Date(trace.startTime).toLocaleTimeString()}</span>
              {trace.totalDurationMs && (
                <>
                  <span>•</span>
                  <span>{formatDuration(trace.totalDurationMs)}</span>
                </>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {trace.validationScore !== undefined && (
            <span className={`text-xs font-mono px-2 py-0.5 rounded ${
              trace.validationScore >= 100 ? 'bg-emerald-900/50 text-emerald-300' :
              trace.validationScore >= 70 ? 'bg-amber-900/50 text-amber-300' :
              'bg-rose-900/50 text-rose-300'
            }`}>
              {trace.validationScore}/100
            </span>
          )}
        </div>
      </div>
      
      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-zinc-800 p-3 space-y-4">
          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-2 text-[10px]">
            <div className="p-2 bg-zinc-900 rounded text-center">
              <div className="text-zinc-500 uppercase tracking-wider">Events</div>
              <div className="text-lg font-mono text-zinc-200">{trace.events.length}</div>
            </div>
            <div className="p-2 bg-zinc-900 rounded text-center">
              <div className="text-zinc-500 uppercase tracking-wider">Preserved</div>
              <div className="text-lg font-mono text-emerald-400">{trace.migrationPreserved ?? '-'}</div>
            </div>
            <div className="p-2 bg-zinc-900 rounded text-center">
              <div className="text-zinc-500 uppercase tracking-wider">Dropped</div>
              <div className="text-lg font-mono text-rose-400">{trace.migrationDropped ?? '-'}</div>
            </div>
            <div className="p-2 bg-zinc-900 rounded text-center">
              <div className="text-zinc-500 uppercase tracking-wider">Lens</div>
              <div className="text-lg font-mono">
                {trace.lensLawsSatisfied === true ? '✓' : trace.lensLawsSatisfied === false ? '✗' : '-'}
              </div>
            </div>
          </div>
          
          {/* Toggle Raw View */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
            >
              {showRaw ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showRaw ? 'Hide Raw Data' : 'Show Raw Data'}
            </button>
          </div>
          
          {/* Raw Data View */}
          {showRaw && (
            <pre className="p-3 bg-zinc-950 rounded text-[10px] text-zinc-400 overflow-x-auto max-h-[300px] overflow-y-auto">
              {JSON.stringify({
                systemPromptPreview: trace.systemPromptPreview,
                rawResponsePreview: trace.rawResponsePreview,
                parsedProposal: trace.parsedProposal,
                failedChecks: trace.failedChecks
              }, null, 2)}
            </pre>
          )}
          
          {/* Event Timeline */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
              Event Timeline
            </div>
            {trace.events.map((event, idx) => {
              const meta = PHASE_META[event.phase];
              const isSelected = selectedEvent === event.id;
              
              return (
                <div key={event.id}>
                  <div 
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                      isSelected ? 'bg-zinc-800' : 'hover:bg-zinc-900'
                    }`}
                    onClick={() => setSelectedEvent(isSelected ? null : event.id)}
                  >
                    {/* Timeline connector */}
                    <div className="w-6 flex flex-col items-center">
                      <div className={`w-2 h-2 rounded-full ${meta.color.replace('text-', 'bg-')}`} />
                      {idx < trace.events.length - 1 && (
                        <div className="w-px h-4 bg-zinc-700 mt-1" />
                      )}
                    </div>
                    
                    {/* Event info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={meta.color}>{meta.icon}</span>
                        <span className="text-xs font-medium text-zinc-300">{meta.label}</span>
                        {event.durationMs !== undefined && event.durationMs > 0 && (
                          <span className="text-[10px] text-zinc-600">
                            +{formatDuration(event.durationMs)}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-500 truncate">
                        {event.summary}
                      </div>
                    </div>
                    
                    {/* Timestamp */}
                    <div className="text-[10px] text-zinc-600 font-mono">
                      {new Date(event.timestamp).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit', 
                        second: '2-digit',
                        fractionalSecondDigits: 3
                      } as Intl.DateTimeFormatOptions)}
                    </div>
                  </div>
                  
                  {/* Event Data (when selected) */}
                  {isSelected && Object.keys(event.data).length > 0 && (
                    <div className="ml-8 mb-2 p-2 bg-zinc-950 rounded text-[10px]">
                      <pre className="text-zinc-400 overflow-x-auto">
                        {JSON.stringify(event.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Main FlowViewer Component
 */
export const FlowViewer: React.FC<FlowViewerProps> = ({ 
  compact = false,
  maxHeight = '600px'
}) => {
  const [traces, setTraces] = useState<AIFlowTrace[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [liveEvents, setLiveEvents] = useState<FlowEvent[]>([]);
  const stats = ObservabilityService.getStats();
  
  // Subscribe to real-time updates
  useEffect(() => {
    // Initial load
    setTraces(ObservabilityService.getTraces());
    
    // Subscribe to new events
    const unsubEvent = ObservabilityService.onEvent((event) => {
      setLiveEvents(prev => [...prev.slice(-10), event]);
    });
    
    // Subscribe to trace completions
    const unsubTrace = ObservabilityService.onTraceComplete(() => {
      setTraces(ObservabilityService.getTraces());
      setLiveEvents([]); // Clear live events when trace completes
    });
    
    return () => {
      unsubEvent();
      unsubTrace();
    };
  }, []);
  
  const handleExport = useCallback(() => {
    const data = ObservabilityService.exportTraces();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neuronote-traces-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);
  
  const handleClear = useCallback(() => {
    if (confirm('Clear all traces? This cannot be undone.')) {
      ObservabilityService.clear();
      setTraces([]);
    }
  }, []);
  
  const currentTrace = ObservabilityService.getCurrentTrace();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            AI Flow Observability
          </span>
          {currentTrace && (
            <span className="px-2 py-0.5 bg-blue-900/50 text-blue-300 text-[10px] rounded animate-pulse">
              LIVE
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleExport}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded"
            title="Export traces as JSON"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={handleClear}
            className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 rounded"
            title="Clear all traces"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      
      {/* Stats Bar */}
      {!compact && (
        <div className="grid grid-cols-5 gap-2 p-3 bg-zinc-900/30 border-b border-zinc-800">
          <div className="text-center">
            <div className="text-lg font-mono text-zinc-200">{stats.totalTraces}</div>
            <div className="text-[9px] uppercase text-zinc-600">Total</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-mono text-emerald-400">{stats.successCount}</div>
            <div className="text-[9px] uppercase text-zinc-600">Success</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-mono text-amber-400">{stats.rejectedCount}</div>
            <div className="text-[9px] uppercase text-zinc-600">Rejected</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-mono text-rose-400">{stats.errorCount}</div>
            <div className="text-[9px] uppercase text-zinc-600">Errors</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-mono text-indigo-400">
              {stats.avgValidationScore > 0 ? stats.avgValidationScore.toFixed(0) : '-'}
            </div>
            <div className="text-[9px] uppercase text-zinc-600">Avg Score</div>
          </div>
        </div>
      )}
      
      {/* Live Events (during active trace) */}
      {currentTrace && liveEvents.length > 0 && (
        <div className="p-3 bg-blue-950/20 border-b border-blue-900/30">
          <div className="text-[10px] uppercase tracking-wider text-blue-400 mb-2">
            Live: {truncate(currentTrace.userPrompt, 40)}
          </div>
          <div className="space-y-1">
            {liveEvents.slice(-5).map(event => {
              const meta = PHASE_META[event.phase];
              return (
                <div key={event.id} className="flex items-center gap-2 text-[10px]">
                  <span className={meta.color}>{meta.icon}</span>
                  <span className="text-zinc-400">{meta.label}</span>
                  <span className="text-zinc-600">{event.summary}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Trace List */}
      <div 
        className="flex-1 overflow-y-auto p-3 space-y-2"
        style={{ maxHeight }}
      >
        {traces.length === 0 && !currentTrace ? (
          <div className="text-center text-zinc-600 py-8">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <div className="text-sm">No AI flows recorded yet</div>
            <div className="text-[10px] mt-1">
              Send a prompt to see the full flow trace
            </div>
          </div>
        ) : (
          traces.map(trace => (
            <TraceCard
              key={trace.id}
              trace={trace}
              expanded={expandedId === trace.id}
              onToggle={() => setExpandedId(expandedId === trace.id ? null : trace.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default FlowViewer;
