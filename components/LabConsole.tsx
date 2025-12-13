import React from 'react';
import { ArchitectureChangeTrace, SessionMetrics, InteractionTrace } from '../types';
import { Microscope, GitCommit, AlertOctagon, CheckCircle2, XCircle, Activity, Timer } from 'lucide-react';

interface LabConsoleProps {
  metrics: SessionMetrics;
  history: ArchitectureChangeTrace[];
  interactions: InteractionTrace[];
}

export const LabConsole: React.FC<LabConsoleProps> = ({ metrics, history, interactions }) => {
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

      {/* 9.2 Architecture Change Trace (Evolution Timeline) */}
      <div className="flex-1 overflow-y-auto border-b border-zinc-800">
          <div className="h-8 flex items-center px-4 bg-zinc-900/50 border-b border-zinc-800 sticky top-0 backdrop-blur">
              <GitCommit className="w-3 h-3 mr-2 text-indigo-500" />
              <span className="font-bold uppercase tracking-wider text-[10px] text-zinc-500">Evolution Timeline</span>
          </div>
          <div className="p-4 space-y-4">
              {history.length === 0 && <div className="text-zinc-700 italic text-center py-4">No evolution data yet.</div>}
              {history.map((trace) => (
                  <div key={trace.id} className="relative pl-4 border-l border-zinc-800">
                      <div className={`absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full border-2 border-black ${
                          trace.status === 'accepted' ? 'bg-emerald-500' : 
                          trace.status === 'rolled_back' ? 'bg-rose-500' : 'bg-zinc-600'
                      }`}></div>
                      
                      <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-zinc-200">{trace.version}</span>
                          <span className="text-[10px] text-zinc-600">{new Date(trace.timestamp).toLocaleTimeString()}</span>
                      </div>
                      
                      <div className="text-zinc-500 mb-2 italic">"{trace.prompt}"</div>
                      
                      {/* Diff View */}
                      <div className="grid grid-cols-3 gap-1 mb-2">
                          <div className="bg-zinc-900 px-2 py-1 rounded text-center">
                              <span className="block text-[8px] text-zinc-600 uppercase">UI Nodes</span>
                              <span className={trace.diff.uiNodes > 0 ? 'text-emerald-500' : trace.diff.uiNodes < 0 ? 'text-rose-500' : 'text-zinc-500'}>
                                {trace.diff.uiNodes > 0 ? '+' : ''}{trace.diff.uiNodes}
                              </span>
                          </div>
                          <div className="bg-zinc-900 px-2 py-1 rounded text-center">
                              <span className="block text-[8px] text-zinc-600 uppercase">Logic</span>
                              <span className={trace.diff.states > 0 ? 'text-indigo-500' : 'text-zinc-500'}>
                                {trace.diff.states > 0 ? '+' : ''}{trace.diff.states}
                              </span>
                          </div>
                          <div className="bg-zinc-900 px-2 py-1 rounded text-center">
                              <span className="block text-[8px] text-zinc-600 uppercase">Data</span>
                              <span className={trace.diff.dataKeys > 0 ? 'text-amber-500' : 'text-zinc-500'}>
                                {trace.diff.dataKeys > 0 ? '+' : ''}{trace.diff.dataKeys}
                              </span>
                          </div>
                      </div>

                      <div className="flex items-center gap-2 text-[10px]">
                          {trace.status === 'accepted' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                          {trace.status === 'rejected' && <XCircle className="w-3 h-3 text-zinc-500" />}
                          {trace.status === 'rolled_back' && <AlertOctagon className="w-3 h-3 text-rose-500" />}
                          <span className="uppercase text-zinc-500">{trace.status}</span>
                          <span className="ml-auto flex items-center gap-1 text-zinc-600">
                              <Timer className="w-3 h-3" /> {trace.latencyMs}ms
                          </span>
                      </div>
                  </div>
              ))}
          </div>
      </div>

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