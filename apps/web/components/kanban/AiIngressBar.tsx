'use client';

import React, { useState } from 'react';
import { Sparkles, Play, RefreshCw } from 'lucide-react';

interface AiIngressBarProps {
  isGenerating: boolean;
  onSubmit: (prompt: string) => Promise<void>;
}

export function AiIngressBar({ isGenerating, onSubmit }: AiIngressBarProps) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    try {
      await onSubmit(prompt);
      setPrompt('');
    } catch (err) {
      // Error logging is already handled in hook, keep interface clean
    }
  };

  return (
    <section className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-6 shadow-xl relative overflow-hidden backdrop-blur-sm">
      <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/5 rounded-full filter blur-3xl pointer-events-none -mr-20 -mt-20" />
      
      <div className="flex items-center space-x-2 mb-4">
        <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
        <h2 className="text-sm font-bold text-zinc-200">AI-First Task Decomposition Pipeline</h2>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row items-stretch gap-3">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isGenerating}
          placeholder="e.g., Add Stripe integration for monthly subscriptions with trial check and webhooks..."
          className="flex-1 bg-zinc-950/80 border border-zinc-800 text-sm rounded-lg px-4 py-3 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition-all"
        />
        <button
          type="submit"
          disabled={isGenerating || !prompt.trim()}
          className="bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-semibold px-6 py-3 rounded-lg flex items-center justify-center space-x-2 shadow-lg shadow-purple-500/10 active:scale-95 transition-all"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Processing Spec...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-white" />
              <span>Decompose Features</span>
            </>
          )}
        </button>
      </form>
    </section>
  );
}
export default AiIngressBar;
