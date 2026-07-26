import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

// 1. Define the input interfaces
export interface SuggestedEpicPayload {
  title: string;
  description: string;
}

export interface GenerateEpicsAndStoriesInput {
  workspaceId: string;
  projectId: string;
  suggestedEpics: SuggestedEpicPayload[];
}

// 2. Define the Zod schema for breaking down a single Epic into tasks
export const TaskDecompositionSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string().describe(
        'High-impact, concise engineering task title starting with a verb (e.g., "Implement Stripe Webhook Handler for invoice.paid").'
      ),
      description: z.string().describe(
        'Detailed technical description specifying codebase files, database modifications, or API endpoints involved.'
      ),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).describe('Task urgency level relative to the project.'),
      story_points: z.number().describe('Estimated task complexity strictly using the Fibonacci scale (1, 2, 3, 5, 8).'),
      acceptance_criteria: z.array(z.string()).describe(
        'List of functional validation steps formatted as markdown checkboxes (e.g., "- [ ] Signature validation works with secret").'
      )
    })
  ).describe('Array of engineering tasks/user stories required to implement this Epic.')
});

export type TaskDecompositionResult = z.infer<typeof TaskDecompositionSchema>;

// 3. Define the service output interfaces
export interface GeneratedTask {
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  storyPoints: number;
  acceptanceCriteria: string[];
}

export interface GeneratedEpicResult {
  title: string;
  description: string;
  status: 'SUCCESS' | 'FAILED';
  tasks: GeneratedTask[];
  errorDetails?: string;
}

export interface GenerateEpicsAndStoriesResult {
  workspaceId: string;
  projectId: string;
  epics: GeneratedEpicResult[];
}

@Injectable()
export class EpicStoryGeneratorService {
  private readonly logger = new Logger(EpicStoryGeneratorService.name);
  private readonly openai: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY environment variable is not defined.');
    }
    this.openai = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL,
    });
  }

  /**
   * Generates a collection of technical stories/tasks for each Epic in parallel.
   * Isolates failures so that a structural failure in one Epic does not abort the entire batch.
   * 
   * @param input GenerateEpicsAndStoriesInput
   * @returns Promise<GenerateEpicsAndStoriesResult>
   */
  async generate(input: GenerateEpicsAndStoriesInput): Promise<GenerateEpicsAndStoriesResult> {
    const { workspaceId, projectId, suggestedEpics } = input;

    if (!suggestedEpics || suggestedEpics.length === 0) {
      return { workspaceId, projectId, epics: [] };
    }

    this.logger.log(
      `Starting task breakdown pipeline for Project: ${projectId} with ${suggestedEpics.length} epics.`
    );

    // Process all suggested epics concurrently using Promise.all
    const breakdownPromises = suggestedEpics.map(async (epic) => {
      try {
        const result = await this.decomposeEpic(epic, workspaceId, projectId);
        return {
          title: epic.title,
          description: epic.description,
          status: 'SUCCESS' as const,
          tasks: result.tasks.map(t => ({
            title: t.title,
            description: t.description,
            priority: t.priority,
            storyPoints: t.story_points,
            acceptanceCriteria: t.acceptance_criteria
          }))
        };
      } catch (error) {
        this.logger.error(
          `Error decomposing Epic "${epic.title}": ${error.message}`,
          error.stack
        );
        return {
          title: epic.title,
          description: epic.description,
          status: 'FAILED' as const,
          tasks: [],
          errorDetails: error.message
        };
      }
    });

    const epics = await Promise.all(breakdownPromises);

    return {
      workspaceId,
      projectId,
      epics
    };
  }

  /**
   * Helper method invoking OpenAI structured outputs to breakdown a single Epic.
   */
  private async decomposeEpic(
    epic: SuggestedEpicPayload,
    workspaceId: string,
    projectId: string
  ): Promise<TaskDecompositionResult> {
    const systemPrompt = `You are a Senior Technical Project Manager. Your role is to break down a single high-level product Epic into fine-grained, developer-actionable tasks/user stories.

Guidelines:
1. Ensure the tasks generated cover all critical components: DB changes (migrations), logic changes (controllers, services), frontend adjustments, and end-to-end integration tests.
2. Formulate high-quality descriptions that specify details like endpoints (e.g. "/api/v1/billing"), dependencies, or schema fields.
3. Every task must contain distinct, checkable markdown acceptance criteria.
4. Estimate story points objectively based on the relative effort (1 = trivial configuration or documentation, 8 = complex integrations or multi-layered architectural updates).`;

    const userPrompt = `Workspace ID: ${workspaceId}
Project ID: ${projectId}

Epic to Decompose:
---
Title: ${epic.title}
Description: ${epic.description}
---`;

    const response = await this.openai.chat.completions.parse({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: zodResponseFormat(TaskDecompositionSchema, 'task_decomposition'),
      temperature: 0.2
    });

    const structuredResult = response.choices[0]?.message.parsed;

    if (!structuredResult) {
      throw new Error(`LLM failed to output parsed JSON for Epic: ${epic.title}`);
    }

    return structuredResult;
  }
}
