'use client';

import React from 'react';
import { Task, TaskStatus } from '@/types/kanban';
import { KanbanCard } from './KanbanCard';

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  isGenerating: boolean;
  isLoading: boolean;
  onDragStart: (e: React.DragEvent, taskId: string, status: TaskStatus) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, status: TaskStatus) => void;
}

export function KanbanColumn({
  status,
  tasks,
  isGenerating,
  isLoading,
  onDragStart,
  onDragOver,
  onDrop
}: KanbanColumnProps) {
  
  // Custom status color mapper
  const getStatusColor = (colStatus: TaskStatus) => {
    switch (colStatus) {
      case 'TODO': return 'bg-zinc-650';
      case 'IN_PROGRESS': return 'bg-blue-500';
      case 'IN_REVIEW': return 'bg-amber-500 animate-pulse';
      case 'DONE': return 'bg-emerald-500';
    }
  };

  return (
    <div
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, status)}
      className="bg-zinc-900/20 border border-zinc-850 rounded-xl p-4 flex flex-col min-h-[600px] transition-all"
    >
      {/* Column Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-4">
        <div className="flex items-center space-x-2">
          <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor(status)}`} />
          <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest">
            {status.replace('_', ' ')}
          </h3>
        </div>
        <span className="text-[10px] bg-zinc-850 px-2 py-0.5 rounded text-zinc-500 font-bold">
          {isLoading ? '...' : tasks.length}
        </span>
      </div>

      {/* Task Cards Container */}
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {/* Loading Skeletons for initial loading state */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-4 animate-pulse space-y-3">
                <div className="h-3.5 bg-zinc-850 rounded w-3/4" />
                <div className="h-2.5 bg-zinc-850 rounded w-full" />
                <div className="h-2.5 bg-zinc-850 rounded w-5/6" />
                <div className="flex justify-between items-center pt-2">
                  <div className="h-5 bg-zinc-850 rounded w-16" />
                  <div className="h-5 bg-zinc-850 rounded w-10" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Loading Skeletons for generating states */}
        {!isLoading && isGenerating && status === 'TODO' && tasks.length === 0 && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-4 animate-pulse space-y-3">
                <div className="h-3.5 bg-zinc-850 rounded w-3/4" />
                <div className="h-2.5 bg-zinc-850 rounded w-full" />
                <div className="h-2.5 bg-zinc-850 rounded w-5/6" />
                <div className="flex justify-between items-center pt-2">
                  <div className="h-5 bg-zinc-850 rounded w-16" />
                  <div className="h-5 bg-zinc-850 rounded w-10" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Card items list */}
        {!isLoading && tasks.map((task) => (
          <KanbanCard
            key={task.id}
            task={task}
            status={status}
            onDragStart={onDragStart}
          />
        ))}

        {/* Empty state container */}
        {!isLoading && tasks.length === 0 && !isGenerating && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-zinc-800/40 rounded-lg min-h-[150px]">
            <p className="text-[11px] text-zinc-650 font-medium">No tasks in this column</p>
          </div>
        )}
      </div>
    </div>
  );
}
export default KanbanColumn;
