import React, { useState } from 'react';
import { ChangeRecord, SessionMetrics, InteractionTrace, EvaluationSuiteReport } from '../types';
import { Microscope, GitCommit, AlertOctagon, CheckCircle2, XCircle, Activity, Timer, Database, Play, ChevronDown, ChevronRight, AlertTriangle, Ghost, ClipboardCheck, Loader2 } from 'lucide-react';
import { EvaluationHarness } from '../utils/harness';
import { INITIAL_APP } from '../constants';

interface LabConsoleProps {
  metrics: SessionMetrics;
  history: ChangeRecord[];
  interactions: InteractionTrace[];
  onReplay?: (record: ChangeRecord) => void;
}

export const LabConsole: React.FC<LabConsoleProps> = ({ metrics, history, interactions, onReplay }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'trace' | 'eval'>('trace');
  const [evalReport, setEvalReport] = useState<EvaluationSuiteReport | null>(null);
  const [isRunningEval, setIsRunningEval] = useState(false);
  const [evalStatus, setEvalStatus] = useState<string>('');
  const [evalError, setEvalError] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
      setExpandedId(prev => prev === id ? null : id);
  };

  const runPaperEvaluation = async () => {
      setIsRunningEval(true);
      setEvalError(null);
      setEvalReport(null);
      
      try {
          setEvalStatus('1/3: Running Adversarial Safety Suite (Prompt Injection)...');
          await new Promise(r => setTimeout(r, 500)); // Visual pacing
          const safety = await EvaluationHarness.runSafetyTests();
          
          setEvalStatus('2/3: Booting Isolated WASM Kernel (Downloading Runtime)...');
          // Note: This step might take a few seconds on first run
          const liveness = await EvaluationHarness.runLivenessTests(INITIAL_APP.initialContext, INITIAL_APP);

          setEvalStatus('3/3: Verifying Bidirectional Lens Laws...');
          await new Promise(r => setTimeout(r, 500));
          const correctness = EvaluationHarness.runCorrectnessTests(INITIAL_APP.initialContext, INITIAL_APP);
          
          setEvalStatus('Finalizing Report...');
          const all = [...safety, ...liveness, ...correctness];
          setEvalReport({
              timestamp: Date.now(),
              results: all,
              passed: all.every(r => r.status === 'PASS')
          });
      } catch (e: any) {
          console.error("Evaluation Suite Crash:", e);
          setEvalError(e.message || "Unknown error during evaluation");
      } finally {
          setIsRunningEval(false);
          setEvalStatus('');
      }
  };

  return (
    <div className="flex flex-col h-full bg-black text-zinc-300 font-mono text-xs">
      
      {/* 9.5 Quantitative Metrics Dashboard */}
      <div className="grid grid-cols-2 gap-2 p-4 border-b border-zinc-800 bg-zinc-900/20">
        <div className="p-3 bg-zinc-900 rounded border border-zinc-800 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase text-zinc-500 mb-1 tracking-wider">Adoption Rate</span>
            <div className={`text-xl font-bold ${metrics.adoptionRate > 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {metrics.adoptionRate}%
            </div>
        </div>
        <div className="p-3 bg-zinc-900 rounded border border-zinc-800 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase text-zinc-500 mb-1 tracking-wider">Safety/Rollback</span>
            <div className={`text-xl font-bold ${metrics.rollbackRate === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {metrics.rollbackRate}%
            </div>
        </div>
        <div className="p-3 bg-zinc-900 rounded border border-zinc-800 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase text-zinc-500 mb-1 tracking-wider">Avg Latency</span>
            <div className="text-xl font-bold text-indigo-400">
                {(metrics.averageLatency / 1000).toFixed(1)}s
            </div>
        </div>
        <div className="p-3 bg-zinc-900 rounded border border-zinc-800 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase text-zinc-500 mb-1 tracking-wider">User Events</span>
            <div className="text-xl font-bold text-zinc-300">
                {metrics.totalInteractions}
            </div>
        </div>
      </div>

      {/* Internal Tabs */}
      <div className="flex border-b border-zinc-800">
          <button 
             onClick={() => setActiveTab('trace')} 
             className={`px-4 py-2 text-[10px] uppercase font-bold tracking-wider ${activeTab === 'trace' ? 'text-zinc-200 bg-zinc-800' : 'text-zinc-600 hover:text-zinc-400'}`}
          >
              Evolution Trace
          </button>
          <button 
             onClick={() => setActiveTab('eval')} 
             className={`px-4 py-2 text-[10px] uppercase font-bold tracking-wider ${activeTab === 'eval' ? 'text-emerald-400 bg-emerald-950/20' : 'text-zinc-600 hover:text-zinc-400'}`}
          >
              Paper Evaluation
          </button>
      </div>

      {activeTab === 'eval' ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="p-4 border border-zinc-800 rounded bg-zinc-900/50">
                  <h3 className="text-sm font-bold text-zinc-100 mb-2">Appendix A: Automated Test Harness</h3>
                  <p className="text-zinc-500 mb-4">
                      Runs the adversarial prompt suite, stress tests the WASM kernel fuel limits, and verifies lens laws as described in Section 4.
                  </p>
                  
                  {isRunningEval && (
                      <div className="mb-4 p-3 bg-zinc-900 border border-zinc-800 rounded text-indigo-300 flex items-center gap-3">
                          <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                          <span className="font-mono text-[10px] tracking-wide">{evalStatus}</span>
                      </div>
                  )}

                  <button 
                      onClick={runPaperEvaluation}
                      disabled={isRunningEval}
                      className={`w-full py-2 text-white rounded font-bold flex items-center justify-center gap-2 ${isRunningEval ? 'bg-zinc-700 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                  >
                      {isRunningEval ? 'Running Test Suite...' : (
                          <>
                             <ClipboardCheck className="w-4 h-4" /> Run System Evaluation
                          </>
                      )}
                  </button>
                  {evalError && (
                      <div className="mt-2 text-rose-500 text-[10px] p-2 bg-rose-950/20 rounded border border-rose-900">
                          Error: {evalError}
                      </div>
                  )}
              </div>

              {evalReport && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
                      <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-zinc-400 uppercase tracking-wider">Results Summary</h4>
                          {evalReport.passed ? 
                              <span className="text-emerald-400 font-bold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> ALL PASSED</span> : 
                              <span className="text-rose-400 font-bold flex items-center gap-1"><XCircle className="w-4 h-4" /> FAILURES DETECTED</span>
                          }
                      </div>
                      {evalReport.results.map((result, idx) => (
                          <div key={idx} className="flex flex-col gap-1 p-3 rounded border border-zinc-800 bg-zinc-900">
                              <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-2">
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                          result.category === 'SAFETY' ? 'bg-rose-950 text-rose-400' :
                                          result.category === 'LIVENESS' ? 'bg-indigo-950 text-indigo-400' :
                                          'bg-amber-950 text-amber-400'
                                      }`}>
                                          {result.category}
                                      </span>
                                      <span className="font-bold text-zinc-300">{result.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                      <span className="text-zinc-600 text-[10px]">{result.latencyMs.toFixed(2)}ms</span>
                                      {result.status === 'PASS' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-rose-500" />}
                                  </div>
                              </div>
                              <div className="pl-2 text-[10px] text-zinc-500 border-l-2 border-zinc-800 ml-1">
                                  {result.details}
                              </div>
                          </div>
                      ))}
                  </div>
              )}
          </div>
      ) : (
      /* 9.2 Architecture Change Trace (Evolution Timeline) */
      <div className="flex-1 overflow-y-auto border-b border-zinc-800">
          <div className="p-4 space-y-4">
              {history.length === 0 && <div className="text-zinc-700 italic text-center py-4">No evolution data yet.</div>}
              {history.map((record) => (
                  <div key={record.id} className="relative pl-4 border-l border-zinc-800">
                      <div className={`absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full border-2 border-black ${
                          record.status === 'accepted' ? 'bg-emerald-500' : 
                          record.status === 'rolled_back' ? 'bg-rose-500' : 'bg-zinc-600'
                      }`}></div>
                      
                      <div className="flex justify-between items-start mb-1 cursor-pointer hover:text-white" onClick={() => toggleExpand(record.id)}>
                          <div className="flex items-center gap-2">
                             {expandedId === record.id ? <ChevronDown className="w-3 h-3 text-zinc-500" /> : <ChevronRight className="w-3 h-3 text-zinc-500" />}
                             <span className="font-bold text-zinc-200">{record.version}</span>
                          </div>
                          <span className="text-[10px] text-zinc-600">{new Date(record.timestamp).toLocaleTimeString()}</span>
                      </div>
                      
                      <div className="text-zinc-500 mb-2 italic pl-5">"{record.prompt}"</div>
                      
                      {/* Diff View */}
                      <div className="grid grid-cols-3 gap-1 mb-2 pl-5">
                          <div className="bg-zinc-900 px-2 py-1 rounded text-center">
                              <span className="block text-[8px] text-zinc-600 uppercase">UI Nodes</span>
                              <span className={record.diff.uiNodes > 0 ? 'text-emerald-500' : record.diff.uiNodes < 0 ? 'text-rose-500' : 'text-zinc-500'}>
                                {record.diff.uiNodes > 0 ? '+' : ''}{record.diff.uiNodes}
                              </span>
                          </div>
                          <div className="bg-zinc-900 px-2 py-1 rounded text-center">
                              <span className="block text-[8px] text-zinc-600 uppercase">Logic</span>
                              <span className={record.diff.states > 0 ? 'text-indigo-500' : 'text-zinc-500'}>
                                {record.diff.states > 0 ? '+' : ''}{record.diff.states}
                              </span>
                          </div>
                          <div className="bg-zinc-900 px-2 py-1 rounded text-center">
                              <span className="block text-[8px] text-zinc-600 uppercase">Data</span>
                              <span className={record.diff.dataKeys > 0 ? 'text-amber-500' : 'text-zinc-500'}>
                                {record.diff.dataKeys > 0 ? '+' : ''}{record.diff.dataKeys}
                              </span>
                          </div>
                      </div>

                      {/* Migration Details */}
                      {record.migration && (
                        <div className="flex flex-col gap-1 mb-2 pl-5">
                            <div className="flex items-center gap-2 p-1.5 bg-zinc-900/50 rounded border border-zinc-800/50">
                                <Database className="w-3 h-3 text-blue-500" />
                                <span className="text-zinc-400">
                                    Preserved: <span className="text-zinc-300">{record.migration.preserved}</span>
                                </span>
                                <span className="text-zinc-600">|</span>
                                <span className="text-zinc-400">
                                    Dropped: <span className={record.migration.dropped > 0 ? "text-rose-400" : "text-zinc-300"}>{record.migration.dropped}</span>
                                </span>
                            </div>
                            
                            {/* Ghost Data Proof */}
                            {record.migration.ghost > 0 && (
                                <div className="flex items-center gap-2 p-1.5 bg-purple-900/20 rounded border border-purple-800/30 animate-in fade-in slide-in-from-left-2">
                                    <Ghost className="w-3 h-3 text-purple-400" />
                                    <span className="text-purple-300 font-bold">
                                        {record.migration.ghost} Ghost Keys Preserved
                                    </span>
                                </div>
                            )}
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-[10px] pl-5">
                          {record.status === 'accepted' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                          {record.status === 'rejected' && <XCircle className="w-3 h-3 text-zinc-500" />}
                          {record.status === 'rolled_back' && <AlertOctagon className="w-3 h-3 text-rose-500" />}
                          <span className="uppercase text-zinc-500">{record.status}</span>
                          <span className="ml-auto flex items-center gap-1 text-zinc-600">
                              <Timer className="w-3 h-3" /> {record.latencyMs}ms
                          </span>
                      </div>

                      {/* Expanded Flight Recorder Details */}
                      {expandedId === record.id && (
                          <div className="mt-2 ml-5 p-3 bg-zinc-900 rounded border border-zinc-800 text-[10px] animate-in fade-in slide-in-from-top-2 duration-200">
                              <div className="flex justify-between items-center mb-2 pb-2 border-b border-zinc-800">
                                  <span className="font-bold uppercase tracking-wider text-zinc-400">Flight Recorder</span>
                                  {onReplay && record.status === 'accepted' && (
                                      <button onClick={() => onReplay(record)} className="flex items-center gap-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors">
                                          <Play className="w-2 h-2 fill-current" /> Replay Version
                                      </button>
                                  )}
                              </div>
                              <div className="space-y-2">
                                  {/* Verification Breakdown */}
                                  {[...record.verificationReport.checks.structural, ...record.verificationReport.checks.semantic, ...record.verificationReport.checks.honesty].map((check, idx) => (
                                      <div key={idx} className={`flex flex-col gap-1 ${check.status === 'PASS' ? 'opacity-50 hover:opacity-100' : ''}`}>
                                          <div className="flex items-center gap-2">
                                              {check.status === 'PASS' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                                              {check.status === 'FAIL' && <XCircle className="w-3 h-3 text-rose-500" />}
                                              {check.status === 'WARN' && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                                              <span className="font-bold">{check.name}</span>
                                          </div>
                                          <div className="pl-5 text-zinc-500">{check.message}</div>
                                          {check.evidence && (
                                              <div className="pl-5 text-zinc-600 font-mono text-[9px]">
                                                  Evidence: {JSON.stringify(check.evidence)}
                                              </div>
                                          )}
                                          {check.recommendedFix && (
                                              <div className="pl-5 text-indigo-400">
                                                  Fix: {check.recommendedFix}
                                              </div>
                                          )}
                                      </div>
                                  ))}
                              </div>
                          </div>
                      )}
                  </div>
              ))}
          </div>
      </div>
      )}

      {/* 9.2 User Interaction Trace (Recent) */}
      <div className="h-1/3 border-t border-zinc-800 flex flex-col">
           <div className="h-8 flex items-center px-4 bg-zinc-900/50 border-b border-zinc-800">
              <Activity className="w-3 h-3 mr-2 text-emerald-500" />
              <span className="font-bold uppercase tracking-wider text-[10px] text-zinc-500">Interaction Trace (Recent)</span>
           </div>
           <div className="flex-1 overflow-y-auto p-2 space-y-1">
               {interactions.slice(-15).map(i => (
                   <div key={i.id} className="flex gap-2 text-[10px] hover:bg-zinc-900 p-1 rounded transition-colors">
                       <span className="text-zinc-600 font-mono w-14">{new Date(i.timestamp).toLocaleTimeString([], {minute:'2-digit', second:'2-digit', fractionalSecondDigits: 2} as any)}</span>
                       <span className={`uppercase font-bold w-12 ${i.type === 'click' ? 'text-indigo-400' : 'text-emerald-400'}`}>{i.type}</span>
                       <span className="text-zinc-400 truncate flex-1">
                           <span className="text-zinc-600 mr-1">[{i.targetId}]</span>
                           {i.event}
                       </span>
                   </div>
               ))}
           </div>
      </div>

    </div>
  );
};