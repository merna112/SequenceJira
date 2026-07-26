'use client';

import React, { useMemo } from 'react';
import { Layers, Github } from 'lucide-react';
import { useKanbanSocket } from '@/hooks/useKanbanSocket';
import { AiIngressBar } from './AiIngressBar';
import { AgentProgressStepper } from './AgentProgressStepper';
import { KanbanColumn } from './KanbanColumn';
import { TASK_STATUSES, TaskStatus } from '@/types/kanban';

export function KanbanBoard() {
  const {
    boardTasks,
    isLoading,
    isGenerating,
    activeStep,
    socketConnected,
    logs,
    triggerGeneration,
    moveTask
  } = useKanbanSocket();

  const totalTasks = useMemo(() => {
    return Object.values(boardTasks).reduce((acc, tasks) => acc + (tasks ? tasks.length : 0), 0);
  }, [boardTasks]);

  // 1. Drag handlers wrapped to avoid re-renders
  const handleDragStart = (e: React.DragEvent, taskId: string, status: TaskStatus) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.setData('originStatus', status);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    const originStatus = e.dataTransfer.getData('originStatus') as TaskStatus;

    if (originStatus === targetStatus || !taskId) return;

    moveTask(taskId, originStatus, targetStatus);
  };

  // Memoized logging lists to save rendering time
  const renderedLogs = useMemo(() => {
    if (logs.length === 0) {
      return <span className="text-zinc-700 italic">No events recorded. Socket idle.</span>;
    }
    return logs.map((log, index) => (
      <div key={index} className="flex items-center space-x-2 truncate">
        <span className="text-zinc-700">&gt;&gt;</span>
        <span className={index === 0 ? 'text-zinc-300' : 'text-zinc-500'}>{log}</span>
      </div>
    ));
  }, [logs]);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-purple-500/30 selection:text-purple-200">
      
      {/* HEADER SECTION */}
      <header className="border-b border-zinc-800 bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-50 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-100 to-zinc-400">SequenceJira</h1>
            <p className="text-xs text-zinc-500 flex items-center">
              Workspace ID: 
              <span className="font-mono text-zinc-400 ml-1">11111111...1111</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest">WebSocket Node</span>
            <span className="text-xs font-semibold flex items-center text-zinc-300">
              <span className={`w-2 h-2 rounded-full mr-2 ${socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              {socketConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>

          <div className="h-8 w-px bg-zinc-800" />

          <div className="flex items-center space-x-2 text-zinc-500 text-xs">
            <Github className="w-4 h-4" />
            <span className="text-zinc-400 font-medium">Hooks Active</span>
          </div>
        </div>
      </header>

      {/* DASHBOARD GRID */}
      <main className="max-w-[1600px] mx-auto px-8 py-8 space-y-8">
        
        {/* Requirement Spec Ingress Block */}
        <AiIngressBar isGenerating={isGenerating} onSubmit={triggerGeneration} />

        {/* Stepper tracking Agent validation loops */}
        <AgentProgressStepper isGenerating={isGenerating} activeStep={activeStep} />

        {/* Dynamic Kanban grid columns */}
        {totalTasks === 0 && !isGenerating && !isLoading ? (
          <div className="flex flex-col items-center justify-center text-center p-16 border border-dashed border-zinc-800 rounded-2xl bg-zinc-950/40 relative overflow-hidden backdrop-blur-sm min-h-[400px] group">
            <div className="absolute top-0 right-0 w-80 h-80 bg-purple-600/5 rounded-full filter blur-3xl pointer-events-none -mr-10 -mt-10" />
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <Layers className="w-8 h-8 text-purple-400" />
            </div>
            <h3 className="text-lg font-bold text-zinc-200 mb-2">No tasks generated yet</h3>
            <p className="text-sm text-zinc-500 max-w-md leading-relaxed">
              No tasks generated yet. Inject your feature specs above to activate the AI triad pipeline!
            </p>
          </div>
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {TASK_STATUSES.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                tasks={boardTasks[status]}
                isGenerating={isGenerating}
                isLoading={isLoading}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            ))}
          </section>
        )}

        {/* Activity System Logging Terminal */}
        <section className="bg-zinc-950 border border-zinc-850 rounded-xl p-5 shadow-inner">
          <div className="flex items-center justify-between mb-3 border-b border-zinc-900 pb-2">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Real-time Connection Logs</span>
            <span className="text-[9px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded font-mono">
              polling: disabled
            </span>
          </div>
          <div className="space-y-1.5 font-mono text-[11px] text-zinc-500">
            {renderedLogs}
          </div>
        </section>

      </main>
    </div>
  );
}
export default KanbanBoard;
