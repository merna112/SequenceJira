'use client';

import React from 'react';
import { RefreshCw, CheckCircle } from 'lucide-react';

interface AgentProgressStepperProps {
  isGenerating: boolean;
  activeStep: number;
}

const PIPELINE_STEPS = [
  'Parsing raw specifications (Agent 1)...',
  'Decomposing epics & generating user stories (Agent 2)...',
  'Auditing dependency hierarchy & applying security validation (Agent 3)...',
  'Committing validated backlog to PostgreSQL database...'
];

export function AgentProgressStepper({ isGenerating, activeStep }: AgentProgressStepperProps) {
  if (!isGenerating) return null;

  return (
    <div className="mt-4 border-t border-zinc-800/80 pt-4 animate-fade-in">
      <p className="text-xs text-zinc-400 mb-3 flex items-center">
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400 mr-2" />
        Background pipeline executing via RabbitMQ:
      </p>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {PIPELINE_STEPS.map((step, idx) => {
          const isActive = idx === activeStep;
          const isCompleted = idx < activeStep;
          
          return (
            <div 
              key={idx} 
              className={`border rounded-lg p-3 transition-all duration-300 ${
                isActive 
                  ? 'bg-purple-500/10 border-purple-500/30 shadow-md shadow-purple-500/5' 
                  : isCompleted 
                    ? 'bg-zinc-950/30 border-zinc-800 opacity-60' 
                    : 'bg-zinc-950/10 border-zinc-900 opacity-30'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider mb-1">
                <span className={idx <= activeStep ? 'text-purple-400' : 'text-zinc-600'}>Agent {idx + 1}</span>
                {isCompleted && <CheckCircle className="w-3.5 h-3.5 text-purple-400" />}
                {isActive && <RefreshCw className="w-3 h-3 animate-spin text-purple-400" />}
              </div>
              <p className="text-[11px] text-zinc-300 line-clamp-2 leading-relaxed">{step}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
export default AgentProgressStepper;
