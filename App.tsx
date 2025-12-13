import React, { useState, useRef, useEffect, useCallback } from 'react';
import { generateAppProposal } from './services/gemini';
import { HostRuntime } from './components/HostRuntime';
import { LabConsole } from './components/LabConsole';
import { INITIAL_APP } from './constants';
import { AppDefinition, SystemLog, AppContext, VerificationReport, ArchitectureChangeTrace, InteractionTrace } from './types';
import { verifyProposal } from './utils/validator';
import { computeDiff, computeSessionMetrics } from './utils/analytics';
import { Terminal, Cpu, ShieldCheck, Activity, BrainCircuit, RefreshCw, AlertTriangle, CheckCircle, XCircle, Microscope, GitCommit } from 'lucide-react';

export default function App() {
  const [appDef, setAppDef] = useState<AppDefinition>(INITIAL_APP);
  const [context, setContext] = useState<AppContext>(INITIAL_APP.initialContext);
  
  const [prompt, setPrompt] = useState('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [verificationReport, setVerificationReport] = useState<VerificationReport | null>(null);

  // 9. Observability State
  const [viewMode, setViewMode] = useState<'control' | 'lab'>('control');
  const [changeHistory, setChangeHistory] = useState<ArchitectureChangeTrace[]>([]);
  const [interactions, setInteractions] = useState<InteractionTrace[]>([]);
  
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((log: SystemLog) => {
    setLogs(prev => [...prev.slice(-49), log]);
  }, []);

  const recordInteraction = useCallback((trace: InteractionTrace) => {
      setInteractions(prev => [...prev.slice(-99), trace]);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleSynthesize = async () => {
    if (!prompt.trim()) return;
    
    setIsSynthesizing(true);
    setError(null);
    setVerificationReport(null);
    const startTime = Date.now();
    addLog({ id: crypto.randomUUID(), timestamp: startTime, source: 'GUEST', type: 'INFO', message: `Analyzing intent: "${prompt}"...` });

    try {
      // 1. Cognition Phase
      const proposal = await generateAppProposal({ ...appDef, initialContext: context }, prompt);
      addLog({ id: crypto.randomUUID(), timestamp: Date.now(), source: 'GUEST', type: 'INFO', message: `Proposal generated: v${proposal.version}` });

      // 2. Verification Phase (The Gatekeeper)
      addLog({ id: crypto.randomUUID(), timestamp: Date.now(), source: 'VALIDATOR', type: 'INFO', message: `Running Trust Assurance Pipeline...` });
      
      const report = await verifyProposal(proposal);
      setVerificationReport(report);

      const diff = computeDiff(appDef, proposal);
      const trace: ArchitectureChangeTrace = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          prompt,
          version: proposal.version,
          status: report.passed ? 'accepted' : 'rejected',
          verificationScore: report.score,
          diff,
          latencyMs: Date.now() - startTime
      };

      if (!report.passed) {
        addLog({ id: crypto.randomUUID(), timestamp: Date.now(), source: 'VALIDATOR', type: 'ERROR', message: `Verification Failed (Score: ${report.score})` });
        setError(`Proposal Rejected: Critical Verification Failure.`);
        setChangeHistory(prev => [trace, ...prev]);
      } else {
        if (report.score < 100) {
            addLog({ id: crypto.randomUUID(), timestamp: Date.now(), source: 'VALIDATOR', type: 'WARN', message: `Proposal Accepted with Warnings (Score: ${report.score})` });
        } else {
            addLog({ id: crypto.randomUUID(), timestamp: Date.now(), source: 'VALIDATOR', type: 'SUCCESS', message: `Proposal Verified (Score: 100)` });
        }

        // 3. Actuation Phase (Hot Swap)
        setContext(prev => {
            const nextContext = { ...proposal.initialContext };
            Object.keys(nextContext).forEach(key => {
                if (prev[key] !== undefined) {
                    nextContext[key] = prev[key];
                }
            });
            return nextContext;
        });

        setAppDef(proposal);
        setPrompt('');
        addLog({ id: crypto.randomUUID(), timestamp: Date.now(), source: 'HOST', type: 'SUCCESS', message: `Hot-swapped to v${proposal.version}` });
        
        setChangeHistory(prev => [trace, ...prev]);
      }

    } catch (e: any) {
      addLog({ id: crypto.randomUUID(), timestamp: Date.now(), source: 'HOST', type: 'ERROR', message: `Synthesis Error: ${e.message}` });
      setError("The Guest Intelligence failed to produce a valid response.");
    } finally {
      setIsSynthesizing(false);
    }
  };

  const metrics = computeSessionMetrics(changeHistory, interactions.length);

  return (
    <div className="min-h-screen bg-black text-zinc-300 flex flex-col md:flex-row overflow-hidden font-mono">
      
      {/* LEFT: The Host Runtime */}
      <div className="flex-1 flex flex-col border-r border-zinc-800 bg-zinc-950/50">
        <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-500" />
            <span className="font-semibold text-zinc-100 tracking-tight">NeuroNote</span>
            <span className="text-xs px-2 py-0.5 bg-zinc-800 rounded text-zinc-400">Host Runtime</span>
          </div>
          <div className="text-xs text-zinc-500 flex items-center gap-2">
            <span className={isSynthesizing ? "animate-pulse text-indigo-400" : "text-green-500"}>●</span>
            {isSynthesizing ? "GUEST ACTIVE" : "HOST SECURE"}
          </div>
        </header>

        <main className="flex-1 p-8 overflow-y-auto relative">
           <HostRuntime 
             definition={appDef} 
             context={context} 
             setContext={setContext}
             onLog={addLog}
             onInteraction={recordInteraction}
           />
        </main>
      </div>

      {/* RIGHT: The Nervous System (Switchable) */}
      <div className="w-full md:w-[450px] flex flex-col bg-black border-l border-zinc-800">
        
        {/* Tab Switcher */}
        <div className="flex border-b border-zinc-800 bg-zinc-900/50">
            <button 
                onClick={() => setViewMode('control')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 ${viewMode === 'control' ? 'bg-zinc-800 text-zinc-200 border-b-2 border-indigo-500' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
                <Terminal className="w-3 h-3" /> Control Plane
            </button>
            <button 
                onClick={() => setViewMode('lab')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 ${viewMode === 'lab' ? 'bg-zinc-800 text-zinc-200 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
                <Microscope className="w-3 h-3" /> Lab Console
            </button>
        </div>

        {viewMode === 'lab' ? (
            <LabConsole metrics={metrics} history={changeHistory} interactions={interactions} />
        ) : (
            <>
                {/* Verification Report Card */}
                {verificationReport && (
                    <div className={`p-4 border-b border-zinc-800 ${verificationReport.passed ? 'bg-emerald-950/10' : 'bg-rose-950/10'}`}>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Verification Report</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${verificationReport.passed ? 'bg-emerald-900 text-emerald-300' : 'bg-rose-900 text-rose-300'}`}>
                                Score: {verificationReport.score}
                            </span>
                        </div>
                        <div className="space-y-2 text-[10px]">
                            {[
                                ...verificationReport.checks.structural, 
                                ...verificationReport.checks.semantic,
                                ...verificationReport.checks.honesty
                            ].map((check, idx) => (
                                <div key={idx} className="flex items-start gap-2">
                                    {check.status === 'PASS' && <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5" />}
                                    {check.status === 'FAIL' && <XCircle className="w-3 h-3 text-rose-500 mt-0.5" />}
                                    {check.status === 'WARN' && <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5" />}
                                    <div className="flex-1">
                                        <span className="font-semibold text-zinc-300">{check.name}:</span>
                                        <span className="text-zinc-500 ml-1">{check.message}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Telemetry Log */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="h-10 border-b border-zinc-800 flex items-center px-4 bg-zinc-900/30">
                        <Activity className="w-4 h-4 text-zinc-500 mr-2" />
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">System Telemetry</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
                        {logs.length === 0 && <div className="text-zinc-700 italic">Waiting for signal trace...</div>}
                        {logs.map((log) => (
                        <div key={log.id} className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <span className="text-zinc-600 shrink-0 w-16">{new Date(log.timestamp).toLocaleTimeString([], {hour12:false, second:'2-digit', minute:'2-digit'})}</span>
                            <div className="flex-1 break-words">
                                <span className={`font-bold mr-2 ${
                                    log.source === 'HOST' ? 'text-indigo-400' :
                                    log.source === 'GUEST' ? 'text-emerald-400' : 
                                    log.source === 'VALIDATOR' ? 'text-amber-400' : 'text-rose-400'
                                }`}>[{log.source}]</span>
                                <span className={log.type === 'ERROR' ? 'text-rose-500' : log.type === 'WARN' ? 'text-amber-500' : 'text-zinc-400'}>{log.message}</span>
                            </div>
                        </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                </div>

                {/* Control Plane */}
                <div className="h-auto border-t border-zinc-800 bg-zinc-900 p-4 pb-8 shadow-2xl z-10">
                    <div className="flex items-center gap-2 mb-3">
                        <BrainCircuit className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider">Guest Intelligence Link</span>
                    </div>
                    
                    {error && (
                        <div className="mb-4 p-3 bg-rose-950/50 border border-rose-900/50 rounded text-rose-200 text-xs flex gap-2 items-start">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            {error}
                        </div>
                    )}

                    <div className="relative">
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Describe a change (e.g., 'Add a task list', 'Make the background red')..."
                            className="w-full bg-black border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none h-24"
                            disabled={isSynthesizing}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSynthesize();
                                }
                            }}
                        />
                        <button
                            onClick={handleSynthesize}
                            disabled={isSynthesizing || !prompt.trim()}
                            className={`absolute bottom-3 right-3 p-2 rounded-md flex items-center justify-center transition-all ${
                                isSynthesizing 
                                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                                : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20'
                            }`}
                        >
                            {isSynthesizing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </>
        )}
      </div>
    </div>
  );
}
