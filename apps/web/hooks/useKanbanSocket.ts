import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Task, TaskStatus } from '@/types/kanban';

export const MOCK_WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
export const MOCK_PROJECT_ID = '22222222-2222-2222-2222-222222222222';
const MOCK_JWT_TOKEN = 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLWlkLXBsYWNlaG9sZGVyIiwid29ya3NwYWNlcyI6WyIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiXSwiaWF0IjoxNzgyNzc2MDQ0fQ.wFA1tRThYMynjVM3UzRg8LejB-KwuJba5egxxoZrxeA';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

export function useKanbanSocket() {
  const [boardTasks, setBoardTasks] = useState<Record<TaskStatus, Task[]>>({
    TODO: [],
    IN_PROGRESS: [],
    IN_REVIEW: [],
    DONE: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [socketConnected, setSocketConnected] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const socketRef = useRef<Socket | null>(null);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 4)]);
  }, []);

  // Fetch initial tasks from backend on mount
  useEffect(() => {
    const fetchTasks = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${BACKEND_URL}/api/v1/ai/tasks`, {
          headers: {
            'x-workspace-id': MOCK_WORKSPACE_ID
          }
        });
        if (!res.ok) {
          throw new Error(`HTTP status ${res.status}`);
        }
        const tasks: Task[] = await res.json();
        
        const grouped: Record<TaskStatus, Task[]> = {
          TODO: [],
          IN_PROGRESS: [],
          IN_REVIEW: [],
          DONE: []
        };
        
        tasks.forEach(task => {
          if (grouped[task.status]) {
            grouped[task.status].push(task);
          }
        });
        
        setBoardTasks(grouped);
        addLog(`Loaded ${tasks.length} existing tasks from database.`);
      } catch (err: any) {
        addLog(`Failed to load existing tasks: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchTasks();
  }, [addLog]);

  // Set up WebSocket connection
  useEffect(() => {
    const socket = io(`${BACKEND_URL}/realtime`, {
      auth: {
        token: `Bearer ${MOCK_JWT_TOKEN}`
      },
      transports: ['websocket']
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      addLog('Real-time WebSockets connected. Isolated to Workspace room.');
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
      addLog('WebSocket disconnected.');
    });

    socket.on('task:generation_progress', (data: { step: number }) => {
      setActiveStep(data.step);
      addLog(`AI Pipeline execution: Agent ${data.step + 1} processing...`);
    });

    socket.on('task:generation_completed', (data: any) => {
      setIsGenerating(false);
      setActiveStep(0);
      
      if (!data.success) {
        addLog(`Generation Error: ${data.error}`);
        alert(`AI Task Generation Failed: ${data.error}`);
        return;
      }

      addLog(`AI Task Generation Completed. Attempts required: ${data.attemptsRequired}`);
      
      const freshTasks: Task[] = [];
      data.epics.forEach((epic: any) => {
        epic.tasks.forEach((task: any, index: number) => {
          freshTasks.push({
            id: task.id || `task-${epic.title.replace(/\s+/g, '-')}-${index}`,
            title: task.title,
            description: task.description,
            priority: task.priority,
            storyPoints: task.storyPoints || task.story_points,
            acceptanceCriteria: task.acceptanceCriteria || task.acceptance_criteria,
            epicTitle: epic.title,
            pullRequestUrl: task.pullRequestUrl,
            status: 'TODO'
          });
        });
      });

      setBoardTasks(prev => ({
        ...prev,
        TODO: [...prev.TODO, ...freshTasks]
      }));
    });

    socket.on('task:moved', (data: { taskId: string; newStatus: TaskStatus; updatedBy: string }) => {
      addLog(`Real-time update: Task ${data.taskId} moved to ${data.newStatus} by ${data.updatedBy}`);
      
      setBoardTasks(prev => {
        let foundTask: Task | null = null;
        const updatedTasks = { ...prev };

        for (const status of Object.keys(updatedTasks) as TaskStatus[]) {
          const index = updatedTasks[status].findIndex(t => t.id === data.taskId);
          if (index !== -1) {
            foundTask = updatedTasks[status][index];
            updatedTasks[status] = updatedTasks[status].filter(t => t.id !== data.taskId);
            break;
          }
        }

        if (foundTask) {
          foundTask.status = data.newStatus;
          updatedTasks[data.newStatus] = [...updatedTasks[data.newStatus], foundTask];
        }

        return updatedTasks;
      });
    });

    socket.on('task:updated', (data: { taskId: string; branchName?: string; branchUrl?: string; status?: TaskStatus }) => {
      addLog(`Real-time update: Task ${data.taskId} updated with Git branch info.`);
      
      setBoardTasks(prev => {
        const updatedTasks = { ...prev };
        let foundTask: Task | null = null;
        let originalStatus: TaskStatus | null = null;

        for (const status of Object.keys(updatedTasks) as TaskStatus[]) {
          const index = updatedTasks[status].findIndex(t => t.id === data.taskId);
          if (index !== -1) {
            foundTask = { ...updatedTasks[status][index] };
            originalStatus = status;
            break;
          }
        }

        if (foundTask && originalStatus) {
          if (data.branchName) foundTask.branchName = data.branchName;
          if (data.branchUrl) foundTask.branchUrl = data.branchUrl;

          const targetStatus = data.status || originalStatus;

          if (originalStatus !== targetStatus) {
            foundTask.status = targetStatus;
            updatedTasks[originalStatus] = updatedTasks[originalStatus].filter(t => t.id !== data.taskId);
            updatedTasks[targetStatus] = [...updatedTasks[targetStatus], foundTask];
          } else {
            updatedTasks[originalStatus] = updatedTasks[originalStatus].map(t => t.id === data.taskId ? foundTask! : t);
          }
        }

        return updatedTasks;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [addLog]);

  const triggerGeneration = useCallback(async (prompt: string) => {
    setIsGenerating(true);
    setActiveStep(0);
    addLog(`Initiating Multi-Agent Pipeline for project: ${MOCK_PROJECT_ID}`);

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/ai/generate-tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': MOCK_WORKSPACE_ID
        },
        body: JSON.stringify({
          projectId: MOCK_PROJECT_ID,
          prompt
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP Error ${res.status}`);
      }

      const data = await res.json();
      addLog(`Job queued successfully. ID: ${data.jobId}`);
      return data;
    } catch (err: any) {
      setIsGenerating(false);
      addLog(`Ingress trigger failed: ${err.message}`);
      throw err;
    }
  }, [addLog]);

  const moveTask = useCallback((taskId: string, originStatus: TaskStatus, targetStatus: TaskStatus) => {
    setBoardTasks(prev => {
      const sourceList = prev[originStatus];
      if (!sourceList) return prev; // Safety guard!
      
      const targetTask = sourceList.find(t => t.id === taskId);
      if (!targetTask) return prev;

      const updatedTask = { ...targetTask, status: targetStatus };

      return {
        ...prev,
        [originStatus]: sourceList.filter(t => t.id !== taskId),
        [targetStatus]: [...prev[targetStatus], updatedTask]
      };
    });

    if (socketRef.current) {
      socketRef.current.emit('task:move', {
        taskId,
        workspaceId: MOCK_WORKSPACE_ID,
        newStatus: targetStatus
      });
      addLog(`Dispatched task:move update for ${taskId} to ${targetStatus}`);
    }
  }, [addLog]);

  return {
    boardTasks,
    isLoading,
    isGenerating,
    setIsGenerating,
    activeStep,
    setActiveStep,
    socketConnected,
    logs,
    triggerGeneration,
    moveTask
  };
}
export default useKanbanSocket;
