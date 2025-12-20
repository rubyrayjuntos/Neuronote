import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createProvider, extractExecutionFeedback, AIProvider, ProviderType, AVAILABLE_PROVIDERS } from './services/ai';
import { Persistence } from './services/persistence';
import { ObservabilityService } from './services/observability';
import { HostRuntime } from './components/HostRuntime';
import { LabConsole } from './components/LabConsole';
import { FlowViewer } from './components/FlowViewer';
import { INITIAL_APP, MAX_LOG_ENTRIES, MAX_INTERACTION_TRACES } from './constants';
import { AppDefinition, SystemLog, AppContext, VerificationReport, ChangeRecord, InteractionTrace } from './types';
import { verifyProposal } from './utils/validator';
import { OPERATOR_REGISTRY } from './operators';
import { computeDiff, computeSessionMetrics } from './utils/analytics';
import { migrateContext, salvageContext, verifyLensLaws } from './utils/migration';
import { runHonestyOracle, formatHonestyReport } from './utils/honestyOracle';
import { useDebounce } from './utils/hooks';
import { Terminal, Cpu, ShieldCheck, Activity, BrainCircuit, RefreshCw, AlertTriangle, CheckCircle, XCircle, Microscope, GitCommit, Database, Eye } from 'lucide-react';

import { buildSystemPrompt } from './services/ai/gemini';

// UUID helper that works in all environments
const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Initialize AI provider based on environment
const getInitialProvider = (): AIProvider => {
  try {
    const providerType = (import.meta.env.VITE_AI_PROVIDER as ProviderType) || 'gemini';
    return createProvider(providerType);
  } catch (e) {
    console.warn('Failed to create AI provider:', e);
    // Return a fallback that will error on use
    return {
      name: 'Unconfigured',
      modelId: 'none',
      generateProposal: async () => {
        throw new Error('AI provider not configured. Set VITE_API_KEY for Gemini or configure AWS credentials.');
      }
    };
  }
};

export default function App() {
  const [appDef, setAppDef] = useState<AppDefinition>(INITIAL_APP);
  const [context, setContext] = useState<AppContext>(INITIAL_APP.initialContext);
  const [isLoaded, setIsLoaded] = useState(false);
  const [manifest, setManifest] = useState<any | null>(null);
  
  const [prompt, setPrompt] = useState('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [verificationReport, setVerificationReport] = useState<VerificationReport | null>(null);

  // AI Provider State - allows runtime provider switching
  const [aiProvider, setAiProvider] = useState<AIProvider>(getInitialProvider);

  // 9. Observability State
  const [viewMode, setViewMode] = useState<'control' | 'lab' | 'flow'>('control');
  const [changeHistory, setChangeHistory] = useState<ChangeRecord[]>([]);
  const [interactions, setInteractions] = useState<InteractionTrace[]>([]);
  
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((log: SystemLog) => {
    setLogs(prev => [...prev.slice(-(MAX_LOG_ENTRIES - 1)), log]);
  }, []);

  const recordInteraction = useCallback((trace: InteractionTrace) => {
      setInteractions(prev => [...prev.slice(-(MAX_INTERACTION_TRACES - 1)), trace]);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // --- PERSISTENCE & MANIFEST LOADING ---
  
  // Load on Mount
  useEffect(() => {
      addLog({ id: generateUUID(), timestamp: Date.now(), source: 'HOST', type: 'INFO', message: 'Booting NeuroNote...' });

      // 1. Fetch Component Manifest
      fetch('/manifest.json')
        .then(res => {
          if (!res.ok) {
            throw new Error(`Failed to fetch manifest: ${res.statusText}`);
          }
          return res.json();
        })
        .then(data => {
          setManifest(data);
          addLog({ id: generateUUID(), timestamp: Date.now(), source: 'HOST', type: 'SUCCESS', message: `Component manifest loaded (v${data.version}).` });
        })
        .catch(err => {
            console.error(err);
            setError("CRITICAL: Could not load component manifest. App cannot function.");
            addLog({ id: generateUUID(), timestamp: Date.now(), source: 'HOST', type: 'ERROR', message: `Failed to load manifest.json: ${err.message}` });
        });

      // 2. Load Persisted State
      const snapshot = Persistence.load();
      if (snapshot) {
          setAppDef(snapshot.definition);
          setContext(snapshot.context);
          addLog({ id: generateUUID(), timestamp: Date.now(), source: 'STORAGE', type: 'SUCCESS', message: `Restored state from ${new Date(snapshot.timestamp).toLocaleTimeString()}` });
      } else {
          addLog({ id: generateUUID(), timestamp: Date.now(), source: 'STORAGE', type: 'INFO', message: 'No saved state found. Starting fresh.' });
      }
      
      const journal = Persistence.loadJournal();
      if (journal && journal.length > 0) {
          setChangeHistory(journal);
          addLog({ id: generateUUID(), timestamp: Date.now(), source: 'STORAGE', type: 'INFO', message: `Loaded ${journal.length} records from Change Journal.` });
      }

      setIsLoaded(true);
  }, [addLog]);

  // Debounced save functions to avoid excessive writes
  const debouncedSaveSnapshot = useDebounce(
      (def: AppDefinition, ctx: AppContext) => Persistence.save(def, ctx),
      500
  );
  
  const debouncedSaveJournal = useDebounce(
      (journal: ChangeRecord[]) => {
          if (journal.length > 0) Persistence.saveJournal(journal);
      },
      500
  );

  // Save Snapshot on Update (debounced)
  useEffect(() => {
      if (!isLoaded) return;
      debouncedSaveSnapshot(appDef, context);
  }, [appDef, context, isLoaded, debouncedSaveSnapshot]);

  // Save Journal on Update (debounced)
  useEffect(() => {
      if (!isLoaded) return;
      debouncedSaveJournal(changeHistory);
  }, [changeHistory, isLoaded, debouncedSaveJournal]);

  // --- FAULT TOLERANCE ---
  const handleRuntimeError = useCallback((error: Error) => {
      addLog({ id: generateUUID(), timestamp: Date.now(), source: 'HOST', type: 'ERROR', message: `CRITICAL: ${error.message}` });
      
      setChangeHistory(prev => {
          if (prev.length === 0) return prev;
          
          const latest = prev[0];
          // Only rollback if it was just accepted and we haven't already rolled back
          if (latest.status === 'accepted') {
              // Update the record to reflect failure
              const updatedRecord: ChangeRecord = { 
                  ...latest, 
                  status: 'rolled_back', 
                  failureReason: error.message 
              };
              
              addLog({ id: generateUUID(), timestamp: Date.now(), source: 'HOST', type: 'WARN', message: `Automatic Rollback to v${latest.oldDef.version}` });
              
              // Perform State Revert
              setAppDef(latest.oldDef);
              
              // RECOVERY LENS: Salvage data from the broken context back into the old schema
              // This uses the Lens.put() operation
              const salvagedContext = salvageContext(context, latest.oldDef);
              setContext(salvagedContext);
              
              return [updatedRecord, ...prev.slice(1)];
          }
          return prev;
      });
  }, [context, addLog]); // Context dependency ensures we have latest data for migration

  // ============================================================================
  // SIMULATION MODE - Shows every step of the AI flow without calling the API
  // ============================================================================
  const handleSimulate = async () => {
    const testPrompt = prompt.trim() || "Add a counter with increment and decrement buttons";
    
    setIsSynthesizing(true);
    setError(null);
    setVerificationReport(null);
    
    addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `━━━ SIMULATION MODE ━━━` });
    addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `User Prompt: "${testPrompt}"` });
    
    // Step 1: Show what we send to the AI
    addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `───── STEP 1: BUILD SYSTEM PROMPT ─────` });
    
    const systemPrompt = buildSystemPrompt(appDef, null, undefined);
    addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `System prompt length: ${systemPrompt.length} chars` });
    addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `System prompt (first 500 chars):\n${systemPrompt.substring(0, 500)}...` });
    
    // Step 2: Show the user message format
    addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `───── STEP 2: FORMAT REQUEST ─────` });
    const userMessage = `USER REQUEST:\n"${testPrompt}"\n\nIMPORTANT: Respond with ONLY a complete JSON AppDefinition containing ALL required fields:\n- version (string)\n- initialContext (object)\n- pipelines (object)\n- machine (object with "initial" and "states")\n- view (object with "id", "type", and UI tree)\n- testVectors (array)\n\nNo markdown code blocks, just raw JSON.`;
    addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `User message:\n${userMessage}` });
    
    // Step 3: Show the mock response (what Claude SHOULD return)
    addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `───── STEP 3: MOCK AI RESPONSE ─────` });
    
    const mockProposal: AppDefinition = {
      version: `v${new Date().toISOString().slice(0, 16).replace('T', '-')}`,
      initialContext: {
        count: 0
      },
      pipelines: {
        increment: {
          inputs: { currentCount: 'number' },
          nodes: [
            { id: 'add1', op: 'Math.Add', inputs: { a: '$currentCount', b: 1 } }
          ],
          output: 'add1'
        },
        decrement: {
          inputs: { currentCount: 'number' },
          nodes: [
            { id: 'sub1', op: 'Math.Subtract', inputs: { a: '$currentCount', b: 1 } }
          ],
          output: 'sub1'
        }
      },
      machine: {
        initial: 'idle',
        states: {
          idle: {
            on: {
              INCREMENT: { actions: ['RUN:increment:count'] },
              DECREMENT: { actions: ['RUN:decrement:count'] }
            }
          }
        }
      },
      view: {
        id: 'root',
        type: 'container',
        props: { className: 'flex flex-col items-center gap-4 p-8' },
        children: [
          {
            id: 'title',
            type: 'header',
            props: { className: 'text-2xl font-bold text-white' },
            textBinding: null,
            children: [{ id: 'title-text', type: 'text', props: {}, children: [], textBinding: null }]
          },
          {
            id: 'counter-display',
            type: 'text',
            props: { className: 'text-6xl font-mono text-indigo-400' },
            textBinding: 'count',
            children: []
          },
          {
            id: 'button-row',
            type: 'container',
            props: { className: 'flex gap-4' },
            children: [
              {
                id: 'dec-btn',
                type: 'button',
                props: { className: 'px-6 py-3 bg-red-600 hover:bg-red-500 rounded-lg text-xl', label: '−' },
                onClick: 'DECREMENT',
                children: []
              },
              {
                id: 'inc-btn',
                type: 'button',
                props: { className: 'px-6 py-3 bg-green-600 hover:bg-green-500 rounded-lg text-xl', label: '+' },
                onClick: 'INCREMENT',
                children: []
              }
            ]
          }
        ]
      },
      testVectors: [
        {
          name: 'Increment increases count',
          initialState: 'idle',
          steps: [
            { event: 'INCREMENT', expectState: 'idle', expectContextKeys: ['count'] }
          ]
        },
        {
          name: 'Decrement decreases count',
          initialState: 'idle', 
          steps: [
            { event: 'DECREMENT', expectState: 'idle', expectContextKeys: ['count'] }
          ]
        }
      ]
    };
    
    addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'SUCCESS', message: `Mock proposal generated: ${mockProposal.version}` });
    console.log('[SIM] Full mock proposal:', JSON.stringify(mockProposal, null, 2));
    addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `Proposal JSON logged to browser console` });
    
    // Step 4: Validation
    addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `───── STEP 4: VALIDATION ─────` });
    
    try {
      const report = await verifyProposal(mockProposal, OPERATOR_REGISTRY);
      setVerificationReport(report);
      
      addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `Structural checks: ${report.checks.structural.length}` });
      report.checks.structural.forEach(c => {
        addLog({ id: generateUUID(), timestamp: Date.now(), source: 'VALIDATOR', type: c.status === 'PASS' ? 'SUCCESS' : 'ERROR', message: `  ${c.status}: ${c.message}` });
      });
      
      addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `Semantic checks: ${report.checks.semantic.length}` });
      report.checks.semantic.forEach(c => {
        addLog({ id: generateUUID(), timestamp: Date.now(), source: 'VALIDATOR', type: c.status === 'PASS' ? 'SUCCESS' : (c.status === 'WARN' ? 'WARN' : 'ERROR'), message: `  ${c.status}: ${c.message}` });
      });
      
      addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `Honesty checks: ${report.checks.honesty.length}` });
      report.checks.honesty.forEach(c => {
        addLog({ id: generateUUID(), timestamp: Date.now(), source: 'VALIDATOR', type: c.status === 'PASS' ? 'SUCCESS' : 'ERROR', message: `  ${c.status}: ${c.message}` });
      });
      
      addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: report.passed ? 'SUCCESS' : 'ERROR', message: `Final Score: ${report.score}/100 - ${report.passed ? 'PASSED' : 'FAILED'}` });
      
      // Step 5: If passed, show what would happen
      if (report.passed) {
        addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `───── STEP 5: APPLY PROPOSAL ─────` });
        addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'SUCCESS', message: `Would update appDef and render new UI` });
        addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `View tree: ${mockProposal.view.type} with ${mockProposal.view.children?.length || 0} children` });
        addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `States: ${Object.keys(mockProposal.machine.states).join(', ')}` });
        addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `Pipelines: ${Object.keys(mockProposal.pipelines || {}).join(', ')}` });
        
        // Actually apply it so we can see it work
        addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `───── APPLYING MOCK PROPOSAL ─────` });
        setAppDef(mockProposal);
        setContext(mockProposal.initialContext);
        addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'SUCCESS', message: `✓ Counter app is now live! Try clicking the buttons.` });
      }
      
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'ERROR', message: `Validation error: ${msg}` });
    }
    
    addLog({ id: generateUUID(), timestamp: Date.now(), source: 'SIM', type: 'INFO', message: `━━━ SIMULATION COMPLETE ━━━` });
    setIsSynthesizing(false);
  };


  const handleSynthesize = async () => {
    if (!prompt.trim()) return;
    
    setIsSynthesizing(true);
    setError(null);
    setVerificationReport(null);
    const startTime = Date.now();
    
    // ========================================================================
    // OBSERVABILITY: Start trace for 100% transparency
    // ========================================================================
    const traceId = ObservabilityService.startTrace(
      prompt, 
      aiProvider.name, 
      aiProvider.modelId
    );
    
    addLog({ id: generateUUID(), timestamp: startTime, source: 'GUEST', type: 'INFO', message: `Analyzing intent: "${prompt}"...` });

    try {
      // 1. Cognition Phase (with execution feedback for self-correction)
      const feedback = extractExecutionFeedback(changeHistory);
      
      ObservabilityService.recordPhase('CONTEXT_ASSEMBLED', {
        currentVersion: appDef.version,
        contextKeys: Object.keys(context),
        hasFeedback: !!feedback,
        feedbackType: feedback?.failureType
      }, `Context assembled: ${Object.keys(context).length} keys, feedback: ${feedback ? 'yes' : 'no'}`);
      
      if (feedback) {
        addLog({ id: generateUUID(), timestamp: Date.now(), source: 'GUEST', type: 'WARN', message: `Providing feedback about previous failure: ${feedback.failureType}` });
      }
      
      addLog({ id: generateUUID(), timestamp: Date.now(), source: 'GUEST', type: 'INFO', message: `Using AI provider: ${aiProvider.name} (${aiProvider.modelId})` });
      
      // Build system prompt for observability (capture what we send)
      const systemPromptPreview = buildSystemPrompt(appDef, feedback || null, undefined);
      ObservabilityService.recordPhase('SYSTEM_PROMPT_BUILT', {
        length: systemPromptPreview.length,
        preview: systemPromptPreview.substring(0, 500)
      }, `System prompt built: ${systemPromptPreview.length} chars`);
      
      ObservabilityService.recordPhase('AI_REQUEST_SENT', {
        provider: aiProvider.name,
        model: aiProvider.modelId,
        promptLength: prompt.length
      }, `Request sent to ${aiProvider.name}/${aiProvider.modelId}`);
      
      let proposal: AppDefinition;
      try {
        proposal = await aiProvider.generateProposal({ ...appDef, initialContext: context }, prompt, feedback);
        
        // Capture raw response info
        const rawJson = JSON.stringify(proposal);
        ObservabilityService.recordPhase('AI_RESPONSE_RECEIVED', {
          length: rawJson.length,
          preview: rawJson.substring(0, 500),
          version: proposal.version
        }, `Response received: ${rawJson.length} chars, version ${proposal.version}`);
        
      } catch (aiError) {
        const errorMsg = aiError instanceof Error ? aiError.message : 'Unknown AI error';
        ObservabilityService.failTrace(aiError instanceof Error ? aiError : new Error(errorMsg), 'AI_REQUEST_SENT');
        addLog({ id: generateUUID(), timestamp: Date.now(), source: 'GUEST', type: 'ERROR', message: `AI Generation Failed: ${errorMsg}` });
        addLog({ id: generateUUID(), timestamp: Date.now(), source: 'GUEST', type: 'INFO', message: `Check browser console for raw AI response (search for [BEDROCK])` });
        throw aiError;
      }
      
      ObservabilityService.recordPhase('RESPONSE_PARSED', {
        proposal: proposal,
        pipelineCount: Object.keys(proposal.pipelines || {}).length,
        stateCount: Object.keys(proposal.machine?.states || {}).length
      }, `Parsed: ${Object.keys(proposal.pipelines || {}).length} pipelines, ${Object.keys(proposal.machine?.states || {}).length} states`);
      
      // Log the raw proposal for debugging
      console.log('[AI PROPOSAL]', JSON.stringify(proposal, null, 2));
      addLog({ id: generateUUID(), timestamp: Date.now(), source: 'GUEST', type: 'INFO', message: `Proposal generated: v${proposal.version}` });

      // TODO: Integrity Verification (Air Gap) - Future implementation
      addLog({ id: generateUUID(), timestamp: Date.now(), source: 'VALIDATOR', type: 'INFO', message: `Skipping signature verification (not yet implemented)...` });

      // 3. Verification Phase (The Gatekeeper)
      ObservabilityService.recordPhase('VALIDATION_STARTED', {}, 'Starting Trust Assurance Pipeline');
      addLog({ id: generateUUID(), timestamp: Date.now(), source: 'VALIDATOR', type: 'INFO', message: `Running Trust Assurance Pipeline...` });
      
      const report = await verifyProposal(proposal, OPERATOR_REGISTRY);
      
      // Record individual validation phases
      const structuralFails = report.checks.structural.filter(c => c.status === 'FAIL').map(c => c.message);
      ObservabilityService.recordPhase('VALIDATION_STRUCTURAL', {
        count: report.checks.structural.length,
        passed: structuralFails.length === 0,
        failures: structuralFails
      }, `Structural: ${report.checks.structural.length} checks, ${structuralFails.length} failures`);
      
      const semanticFails = report.checks.semantic.filter(c => c.status === 'FAIL').map(c => c.message);
      ObservabilityService.recordPhase('VALIDATION_SEMANTIC', {
        count: report.checks.semantic.length,
        passed: semanticFails.length === 0,
        failures: semanticFails
      }, `Semantic: ${report.checks.semantic.length} checks, ${semanticFails.length} failures`);
      
      setVerificationReport(report);

      // 3.5 Honesty Oracle - Semantic Attack Detection
      const honestyResult = runHonestyOracle(prompt, proposal, appDef);
      
      ObservabilityService.recordPhase('VALIDATION_HONESTY', {
        passed: honestyResult.passed,
        concerns: honestyResult.concerns,
        promptKeywords: honestyResult.promptKeywords
      }, `Honesty Oracle: ${honestyResult.passed ? 'PASSED' : 'FAILED'}, ${honestyResult.concerns.length} concerns`);
      
      addLog({ 
        id: generateUUID(), 
        timestamp: Date.now(), 
        source: 'VALIDATOR', 
        type: honestyResult.passed ? (honestyResult.concerns.length > 0 ? 'WARN' : 'SUCCESS') : 'ERROR', 
        message: formatHonestyReport(honestyResult)
      });

      // Aggregate all failures for observability
      const allFails = [...structuralFails, ...semanticFails, ...honestyResult.concerns];
      ObservabilityService.recordPhase('VALIDATION_COMPLETE', {
        passed: report.passed,
        score: report.score,
        structuralCount: report.checks.structural.length,
        semanticCount: report.checks.semantic.length,
        honestyCount: honestyResult.concerns.length + (honestyResult.passed ? 0 : 1),
        failedChecks: allFails
      }, `Validation complete: score ${report.score}/100, ${report.passed ? 'PASSED' : 'FAILED'}`);

      const diff = computeDiff(appDef, proposal);
      
      // Calculate Migration Preview (Lens.get)
      const migrationResult = migrateContext(context, proposal);
      
      ObservabilityService.recordPhase('MIGRATION_COMPUTED', {
        preserved: migrationResult.stats.preserved,
        dropped: migrationResult.stats.dropped,
        added: migrationResult.stats.added,
        ghost: migrationResult.stats.ghost,
        ghostKeys: migrationResult.stats.ghostKeys
      }, `Migration: preserved ${migrationResult.stats.preserved}, dropped ${migrationResult.stats.dropped}, ghost ${migrationResult.stats.ghost}`);
      
      // PROOF OF PRESERVATION: Verify Lens Laws
      const lensCheck = verifyLensLaws(context, proposal);
      
      ObservabilityService.recordPhase('LENS_LAWS_VERIFIED', {
        satisfied: lensCheck.satisfied,
        violation: lensCheck.violation
      }, lensCheck.satisfied ? 'Lens Laws Satisfied' : `VIOLATION: ${lensCheck.violation}`);
      
      if (!lensCheck.satisfied) {
          addLog({ id: generateUUID(), timestamp: Date.now(), source: 'VALIDATOR', type: 'WARN', message: `LENS LAW VIOLATION: ${lensCheck.violation}` });
      } else {
          addLog({ id: generateUUID(), timestamp: Date.now(), source: 'VALIDATOR', type: 'SUCCESS', message: `Lens Laws Satisfied (Bidirectional Integrity Verified)` });
      }

      // Create Full Change Record
      const record: ChangeRecord = {
          id: generateUUID(),
          timestamp: Date.now(),
          prompt,
          version: proposal.version,
          status: report.passed ? 'accepted' : 'rejected',
          
          oldDef: appDef, // Snapshot for Replay
          newDef: proposal, // Snapshot for Replay

          verificationReport: report,
          verificationScore: report.score,
          diff,
          migration: migrationResult.stats,
          latencyMs: Date.now() - startTime
      };

      if (!report.passed) {
        addLog({ id: generateUUID(), timestamp: Date.now(), source: 'VALIDATOR', type: 'ERROR', message: `Verification Failed (Score: ${report.score})` });
        
        const failures = [
          ...report.checks.structural, 
          ...report.checks.semantic,
          ...report.checks.honesty
        ].filter(c => c.status === 'FAIL');
        
        const topFailure = failures.length > 0 
          ? failures[0].message 
          : 'Critical Verification Failure.';
          
        setError(`Proposal Rejected: ${topFailure}`);
        setChangeHistory(prev => [record, ...prev]);
        
        // Complete trace as rejected
        ObservabilityService.rejectTrace(topFailure);
      } else {
        if (report.score < 100) {
            addLog({ id: generateUUID(), timestamp: Date.now(), source: 'VALIDATOR', type: 'WARN', message: `Proposal Accepted with Warnings (Score: ${report.score})` });
        } else {
            addLog({ id: generateUUID(), timestamp: Date.now(), source: 'VALIDATOR', type: 'SUCCESS', message: `Proposal Verified (Score: 100)` });
        }

        // 4. Actuation Phase (Hot Swap with Migration)
        ObservabilityService.recordPhase('PROPOSAL_APPLIED', {
          version: proposal.version,
          preservedKeys: migrationResult.stats.preserved
        }, `Applied ${proposal.version}, preserved ${migrationResult.stats.preserved} keys`);
        
        setContext(migrationResult.context);
        setAppDef(proposal);
        setPrompt('');
        addLog({ id: generateUUID(), timestamp: Date.now(), source: 'HOST', type: 'SUCCESS', message: `Migrated to v${proposal.version}. Preserved ${migrationResult.stats.preserved} keys.` });
        
        setChangeHistory(prev => [record, ...prev]);
        
        // Complete trace as success
        ObservabilityService.completeTrace(proposal.version);
      }

    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      
      // Fail the trace if not already failed
      if (ObservabilityService.getCurrentTrace()) {
        ObservabilityService.failTrace(
          e instanceof Error ? e : new Error(message), 
          'FLOW_ERROR'
        );
      }
      
      addLog({ id: generateUUID(), timestamp: Date.now(), source: 'HOST', type: 'ERROR', message: `Synthesis Error: ${message}` });
      setError("The Guest Intelligence failed to produce a valid response.");
    } finally {
      setIsSynthesizing(false);
    }
  };
  
// ... (rest of the component)


  const handleReplay = useCallback(async (record: ChangeRecord) => {
      if (!manifest) return;
      addLog({ id: generateUUID(), timestamp: Date.now(), source: 'HOST', type: 'WARN', message: `REPLAYING ARCHITECTURE: v${record.version}` });

      // Re-run validation to prove determinism
      const report = await verifyProposal(record.newDef, OPERATOR_REGISTRY);
      
      // Hot swap to the recorded definition
      setAppDef(record.newDef);
      
      // Lens.get() for replay
      const migration = migrateContext(context, record.newDef);
      setContext(migration.context);

      setVerificationReport(report); // Show the re-verified report
      setViewMode('control'); // Switch back to control view to see effect
  }, [context, addLog, manifest]);

  const handleReset = () => {
      Persistence.reset();
      window.location.reload();
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
          <div className="flex items-center gap-4">
            <button onClick={handleReset} className="text-xs text-zinc-600 hover:text-rose-500 transition-colors flex items-center gap-1">
                <Database className="w-3 h-3" /> Reset Storage
            </button>
            <div className="text-xs text-zinc-500 flex items-center gap-2">
                <span className={isSynthesizing ? "animate-pulse text-indigo-400" : "text-green-500"}>●</span>
                {isSynthesizing ? "GUEST ACTIVE" : "HOST SECURE"}
            </div>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-y-auto relative">
           <HostRuntime 
             definition={appDef} 
             context={context} 
             setContext={setContext}
             onLog={addLog}
             onInteraction={recordInteraction}
             onRuntimeError={handleRuntimeError}
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
                <Terminal className="w-3 h-3" /> Control
            </button>
            <button 
                onClick={() => setViewMode('flow')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 ${viewMode === 'flow' ? 'bg-zinc-800 text-zinc-200 border-b-2 border-cyan-500' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
                <Eye className="w-3 h-3" /> Flow
            </button>
            <button 
                onClick={() => setViewMode('lab')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 ${viewMode === 'lab' ? 'bg-zinc-800 text-zinc-200 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
                <Microscope className="w-3 h-3" /> Lab
            </button>
        </div>

        {viewMode === 'flow' ? (
            <FlowViewer maxHeight="calc(100vh - 60px)" />
        ) : viewMode === 'lab' ? (
            <LabConsole 
                metrics={metrics} 
                history={changeHistory} 
                interactions={interactions} 
                onReplay={handleReplay} 
            />
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
                                <div key={idx} className="flex flex-col gap-1 border-b border-zinc-800/50 pb-2 last:border-0">
                                    <div className="flex items-center gap-2">
                                        {check.status === 'PASS' && <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />}
                                        {check.status === 'FAIL' && <XCircle className="w-3 h-3 text-rose-500 shrink-0" />}
                                        {check.status === 'WARN' && <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />}
                                        <span className="font-bold text-zinc-300">{check.name}</span>
                                    </div>
                                    <div className="pl-5 text-zinc-500">{check.message}</div>
                                    {/* Show Recommendation if failed */}
                                    {(check.status === 'FAIL' || check.status === 'WARN') && check.recommendedFix && (
                                        <div className="pl-5 text-indigo-400 font-mono flex gap-1">
                                            <span>→</span>
                                            <span>{check.recommendedFix}</span>
                                        </div>
                                    )}
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
                                    log.source === 'VALIDATOR' ? 'text-amber-400' : 
                                    log.source === 'STORAGE' ? 'text-blue-400' : 'text-rose-400'
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
                            placeholder={!manifest ? "Loading Operator Manifest..." : "Describe a change (e.g., 'Add a task list', 'Make the background red')..."}
                            className="w-full bg-black border border-zinc-700 rounded-lg p-3 pb-8 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none h-24"
                            disabled={isSynthesizing || !manifest}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSynthesize();
                                }
                            }}
                        />
                        <div className="absolute bottom-2 left-3 text-[10px] text-zinc-600 flex items-center gap-1">
                            <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-500 font-mono">⏎</kbd>
                            <span>to submit</span>
                            <span className="mx-1 text-zinc-700">•</span>
                            <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-500 font-mono">⇧⏎</kbd>
                            <span>for newline</span>
                        </div>
                        {/* Simulate button - tests the flow without calling AI */}
                        <button
                            onClick={handleSimulate}
                            disabled={isSynthesizing || !manifest}
                            title="Simulate: Test the flow with a mock response (no API call)"
                            className={`absolute bottom-3 right-14 p-2 rounded-md flex items-center justify-center transition-all ${
                                (isSynthesizing || !manifest)
                                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                                : 'bg-amber-600 text-white hover:bg-amber-500 shadow-lg shadow-amber-500/20'
                            }`}
                        >
                            <Microscope className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleSynthesize}
                            disabled={isSynthesizing || !prompt.trim() || !manifest}
                            title="Synthesize: Call AI to generate proposal"
                            className={`absolute bottom-3 right-3 p-2 rounded-md flex items-center justify-center transition-all ${
                                (isSynthesizing || !prompt.trim() || !manifest)
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