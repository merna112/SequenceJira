export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  storyPoints: number;
  acceptanceCriteria: string[];
  status: TaskStatus;
  epicTitle?: string;
  pullRequestUrl?: string;
  branchName?: string;
  branchUrl?: string;
}

export const TASK_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

export const PRIORITY_COLORS = {
  LOW: 'text-zinc-400 bg-zinc-900 border-zinc-800',
  MEDIUM: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  HIGH: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  CRITICAL: 'text-rose-400 bg-rose-500/10 border-rose-500/20'
};
