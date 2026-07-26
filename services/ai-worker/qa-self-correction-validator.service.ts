import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

// 1. Define the input payloads
export interface InputTask {
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  storyPoints: number;
  acceptanceCriteria: string[];
}

export interface InputEpic {
  title: string;
  description: string;
  tasks: InputTask[];
}

export interface QASelfCorrectionInput {
  workspaceId: string;
  projectId: string;
  originalRequirements: string;
  epics: InputEpic[];
}

// 2. Define the Zod verification schema for the self-correcting validation response
export const CorrectedTaskSchema = z.object({
  title: z.string().describe('Task title, starting with an active verb.'),
  description: z.string().describe('Clear, technical requirement statement detailing implementation tasks.'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  story_points: z.number().describe('Fibonacci scale estimation (1, 2, 3, 5, 8).'),
  acceptance_criteria: z.array(z.string()).describe('Acceptance validation checkboxes (e.g. "- [ ] Task description").')
});

export const CorrectedEpicSchema = z.object({
  title: z.string().describe('Epic title.'),
  description: z.string().describe('Epic description.'),
  tasks: z.array(CorrectedTaskSchema)
});

export const QASelfCorrectionSchema = z.object({
  is_valid: z.boolean().describe(
    'True if the tasks are chronologically sound (dependencies first), align with requirements, and contain no security gaps. Otherwise, false.'
  ),
  critique_report: z.string().describe(
    'Detailed explanation of why the payload failed validation (e.g., missed dependency, security risks, mismatch with original scope). State "Passed" if valid.'
  ),
  corrected_epics_and_tasks: z.array(CorrectedEpicSchema).describe(
    'The adjusted/corrected set of epics and tasks. This field MUST be populated with the correct layout, regardless of whether is_valid is true or false.'
  )
});

export type QASelfCorrectionResult = z.infer<typeof QASelfCorrectionSchema>;

// Output type from this service to the rest of the application
export interface FinalValidationResult {
  workspaceId: string;
  projectId: string;
  isValid: boolean;
  attemptsRequired: number;
  critiqueReport: string;
  epics: InputEpic[];
}

@Injectable()
export class QASelfCorrectionValidatorService {
  private readonly logger = new Logger(QASelfCorrectionValidatorService.name);
  private readonly openai: OpenAI;
  private readonly MAX_RETRIES = 3;

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
   * Runs the self-correcting validation loop. Iteratively critiques and updates
   * generated Epics & Tasks until they are logically consistent or max attempts are reached.
   * 
   * @param input QASelfCorrectionInput
   * @returns Promise<FinalValidationResult>
   */
  async validateAndCorrect(input: QASelfCorrectionInput): Promise<FinalValidationResult> {
    const { workspaceId, projectId, originalRequirements } = input;
    let currentEpics: InputEpic[] = JSON.parse(JSON.stringify(input.epics)); // Deep copy input

    this.logger.log(
      `Starting QA self-correction validation loop for Project: ${projectId}. Max retries: ${this.MAX_RETRIES}`
    );

    let attempts = 0;
    let isValid = false;
    let finalCritiqueReport = 'No validation executed yet.';

    const systemPrompt = `You are a Lead QA Architect and Security Engineer. Your job is to validate and self-correct a proposed backlog of Epics and Tasks.

You will receive the original product requirements and the current proposed backlog structure.
You must review the backlog against these strict architectural criteria:
1. **Logical Dependency**: Database schema adjustments or database migrations MUST be scheduled in tasks chronologically BEFORE any service logic or UI features that query them.
2. **Security & Privacy**: Look for omissions of security patterns (e.g., check that secret environment configurations, auth policies, encryption routines, and input validation are explicit).
3. **Scope Completeness**: Compare the backlog tasks against the original product requirements. Highlight if any feature or requirement was missed or hallucinated.

Evaluation:
- If gaps or ordering errors exist, set "is_valid" to false and explain the issues clearly in "critique_report". Modify and re-order the "corrected_epics_and_tasks" list.
- If the tasks are complete, secure, and chronologically correct, set "is_valid" to true and return the input tasks inside "corrected_epics_and_tasks".`;

    while (attempts < this.MAX_RETRIES && !isValid) {
      attempts++;
      this.logger.log(`Executing validation validation iteration ${attempts}/${this.MAX_RETRIES}...`);

      const userPrompt = `Original Product Requirements:
---
${originalRequirements}
---

Current Backlog (Iteration #${attempts}):
${JSON.stringify(currentEpics, null, 2)}

${attempts > 1 ? `Previous Correction Feedback (Why this iteration is running):
---
${finalCritiqueReport}
---` : ''}

Please audit the backlog, perform needed changes, and output the validation checks.`;

      try {
        const response = await this.openai.chat.completions.parse({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: zodResponseFormat(QASelfCorrectionSchema, 'qa_self_correction'),
          temperature: 0.1 // Keep temperature minimal to keep correction logical and consistent
        });

        const validationOutput = response.choices[0]?.message.parsed;

        if (!validationOutput) {
          throw new Error('LLM failed to output parsed JSON for self-correction validator.');
        }

        isValid = validationOutput.is_valid;
        finalCritiqueReport = validationOutput.critique_report;

        // Map corrected output back to standard input interfaces for subsequent loops or final output
        currentEpics = validationOutput.corrected_epics_and_tasks.map((epic) => ({
          title: epic.title,
          description: epic.description,
          tasks: epic.tasks.map((task) => ({
            title: task.title,
            description: task.description,
            priority: task.priority,
            storyPoints: task.story_points,
            acceptanceCriteria: task.acceptance_criteria
          }))
        }));

        this.logger.log(
          `Iteration ${attempts} complete. Validation Status: ${isValid ? 'PASSED' : 'FAILED'}. Critique: "${finalCritiqueReport}"`
        );

      } catch (error) {
        this.logger.error(
          `Validation loop iteration ${attempts} failed due to unexpected error: ${error.message}`,
          error.stack
        );
        // Fallback: If OpenAI fails or times out, terminate loop to prevent infinite runs
        if (attempts === this.MAX_RETRIES) {
          throw new InternalServerErrorException(
            `Self-correction validator aborted due to runtime error: ${error.message}`
          );
        }
      }
    }

    if (!isValid) {
      this.logger.warn(
        `Self-correction validator reached MAX_RETRIES (${this.MAX_RETRIES}) without fully passing validation rules. Proceeding with best-effort corrected structures.`
      );
    } else {
      this.logger.log(`QA self-correction check passed successfully in ${attempts} attempts.`);
    }

    return {
      workspaceId,
      projectId,
      isValid,
      attemptsRequired: attempts,
      critiqueReport: finalCritiqueReport,
      epics: currentEpics
    };
  }
}
