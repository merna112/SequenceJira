'use client';

import React from 'react';
import { GitPullRequest, Clock, GitBranch } from 'lucide-react';
import { Task, TaskStatus, PRIORITY_COLORS } from '@/types/kanban';

interface KanbanCardProps {
  task: Task;
  status: TaskStatus;
  onDragStart: (e: React.DragEvent, taskId: string, status: TaskStatus) => void;
}

export function KanbanCard({ task, status, onDragStart }: KanbanCardProps) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id, status)}
      className="bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-850 hover:border-zinc-800 rounded-lg p-4 shadow-md transition-all duration-300 cursor-grab active:cursor-grabbing hover:-translate-y-[2px] active:scale-[0.98] group relative overflow-hidden animate-slide-in"
    >
      {/* Glowing highlight for tasks in review */}
      {status === 'IN_REVIEW' && (
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-amber-400 to-orange-500" />
      )}

      <div className="flex flex-col space-y-2">
        <div className="flex items-start justify-between">
          <span className="text-[10px] font-bold text-zinc-500 tracking-wider">
            {task.epicTitle || 'Task'}
          </span>
          <span className={`text-[9px] px-2 py-0.5 font-bold rounded-full border ${PRIORITY_COLORS[task.priority]}`}>
            {task.priority}
          </span>
        </div>

        <h4 className="text-sm font-bold text-zinc-200 group-hover:text-purple-400 transition-colors">
          {task.title}
        </h4>
        
        <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
          {task.description}
        </p>

        {/* Display GitHub connection or branch details dynamically if webhook triggered it */}
        <div className="flex flex-col space-y-2 pt-3 border-t border-zinc-900 mt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {task.pullRequestUrl ? (
                <a 
                  href={task.pullRequestUrl} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-[10px] font-semibold text-purple-400 hover:underline flex items-center"
                >
                  <GitPullRequest className="w-3.5 h-3.5 mr-1 text-purple-400 animate-pulse" />
                  GitHub PR
                </a>
              ) : (
                <span className="text-[10px] text-zinc-650 font-mono">
                  #{task.id.slice(-4)}
                </span>
              )}
            </div>
            
            <div className="bg-zinc-900 border border-zinc-800 text-[10px] font-bold px-2 py-0.5 rounded text-zinc-400 flex items-center">
              <Clock className="w-3 h-3 text-zinc-500 mr-1" />
              {task.storyPoints} pts
            </div>
          </div>

          {task.branchUrl && (
            <div className="flex items-center">
              <a
                href={task.branchUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[9px] font-medium text-emerald-400 hover:underline flex items-center bg-emerald-500/5 border border-emerald-500/10 px-2 py-0.5 rounded w-full justify-center"
              >
                <GitBranch className="w-3 h-3 mr-1 text-emerald-400 animate-pulse" />
                {task.branchName}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default KanbanCard;
