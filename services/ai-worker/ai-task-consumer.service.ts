import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { RequirementsAnalyzerService } from './requirements-analyzer.service';
import { EpicStoryGeneratorService } from './epic-story-generator.service';
import { QASelfCorrectionValidatorService, InputEpic } from './qa-self-correction-validator.service';
import { EventsGateway } from './events.gateway';
import { OctokitService } from './octokit.service';
import { PrismaService } from './prisma.service';
import OpenAI from 'openai';
import * as crypto from 'crypto';

// 1. Define the incoming RabbitMQ message structure
export interface TaskGenerationJobPayload {
  workspaceId: string;
  projectId: string;
  userId: string;
  prompt: string;
}

@Injectable()
export class AiTaskConsumerService {
  private readonly logger = new Logger(AiTaskConsumerService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly requirementsAnalyzer: RequirementsAnalyzerService,
    private readonly epicStoryGenerator: EpicStoryGeneratorService,
    private readonly qaValidator: QASelfCorrectionValidatorService,
    private readonly eventsGateway: EventsGateway,
    private readonly octokitService: OctokitService,
    private readonly prisma: PrismaService
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
    });
  }

  /**
   * Subscriber that binds to RabbitMQ and consumes generation jobs asynchronously.
   * This keeps the main application Gateway unblocked during intensive LLM calls.
   * 
   * @param message TaskGenerationJobPayload
   */
  @RabbitSubscribe({
    exchange: 'ai.exchange',
    routingKey: 'task.generation',
    queue: 'ai.task.generation',
  })
  async handleTaskGenerationJob(message: TaskGenerationJobPayload): Promise<void> {
    const { workspaceId, projectId, userId, prompt } = message;

    this.logger.log(
      `[RabbitMQ Consumer] Received task generation job for Workspace: ${workspaceId}, Project: ${projectId}, triggered by User: ${userId}`
    );

    try {
      // PHASE 1: Run Agent 1 - Requirements Analyzer
      this.logger.log(`[AI Worker Pipeline] Invoking Agent 1 (Requirements Analyzer)...`);
      this.eventsGateway.emitTaskGenerationProgress(workspaceId, 0);
      const analysisResult = await this.requirementsAnalyzer.analyze({
        workspaceId,
        projectId,
        rawRequirements: prompt,
      });

      // PHASE 2: Run Agent 2 - Epic & Task Generator
      this.logger.log(`[AI Worker Pipeline] Invoking Agent 2 (Epic & Story Generator)...`);
      this.eventsGateway.emitTaskGenerationProgress(workspaceId, 1);
      const breakdownResult = await this.epicStoryGenerator.generate({
        workspaceId,
        projectId,
        suggestedEpics: analysisResult.suggested_epics,
      });

      // Filter out only successful Epic decompositions to pass to validation
      const successfulEpics: InputEpic[] = breakdownResult.epics
        .filter((e) => e.status === 'SUCCESS')
        .map((e) => ({
          title: e.title,
          description: e.description,
          tasks: e.tasks,
        }));

      if (successfulEpics.length === 0) {
        throw new Error('All suggested epics failed technical decomposition in Agent 2.');
      }

      // PHASE 3: Run Agent 3 - Targeted Self-Correction & QA Validator
      this.logger.log(`[AI Worker Pipeline] Invoking Agent 3 (QA Self-Correction & Validator)...`);
      this.eventsGateway.emitTaskGenerationProgress(workspaceId, 2);
      const validationResult = await this.qaValidator.validateAndCorrect({
        workspaceId,
        projectId,
        originalRequirements: prompt,
        epics: successfulEpics,
      });

      // PHASE 4: Database Persistence
      this.logger.log(`[AI Worker Pipeline] Bulk-saving validated Epics & Tasks to database...`);
      this.eventsGateway.emitTaskGenerationProgress(workspaceId, 3);
      await this.savePipelineResultsToDatabase(workspaceId, projectId, validationResult.epics);

      // PHASE 5: Real-Time Event Broadcast
      this.logger.log(`[AI Worker Pipeline] Directing WebSocket Gateway to notify clients in workspace:${workspaceId}`);
      this.eventsGateway.emitTaskGenerationCompleted(workspaceId, {
        projectId,
        userId,
        success: true,
        epics: validationResult.epics,
        attemptsRequired: validationResult.attemptsRequired,
        critiqueReport: validationResult.critiqueReport,
      });

      this.logger.log(`[AI Worker Pipeline] Job completed successfully for Project ${projectId}`);

    } catch (error) {
      this.logger.error(
        `[AI Worker Pipeline] Fatal failure in processing task generation queue job: ${error.message}`,
        error.stack
      );

      // Notify clients of the failure via WebSockets so the UI can clear loading flags
      this.eventsGateway.emitTaskGenerationCompleted(workspaceId, {
        projectId,
        userId,
        success: false,
        error: error.message || 'Fatal workflow pipeline exception.',
      });
    }
  }

  /**
   * Database persistence method using Prisma.
   */
  private async savePipelineResultsToDatabase(
    workspaceId: string,
    projectId: string,
    epics: InputEpic[]
  ): Promise<void> {
    // Verify/create default project & workspace if they don't exist
    let project = await this.prisma.project.findFirst({
      where: { id: projectId }
    });

    if (!project) {
      let workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId }
      });
      if (!workspace) {
        workspace = await this.prisma.workspace.create({
          data: {
            id: workspaceId,
            name: 'Default Workspace',
            slug: 'default-workspace-' + workspaceId.slice(0, 8)
          }
        });
      }

      project = await this.prisma.project.create({
        data: {
          id: projectId,
          workspaceId,
          name: 'Default Project',
          keyPrefix: 'SEQ',
          description: 'Default project automatically initialized.'
        }
      });
    }

    const keyPrefix = project.keyPrefix;
    let taskCounter = await this.prisma.task.count({
      where: { projectId }
    });

    // Perform bulk write inside transaction
    await this.prisma.$transaction(async (tx) => {
      for (const epicInput of epics) {
        const epic = await tx.epic.create({
          data: {
            workspaceId,
            projectId,
            title: epicInput.title,
            description: epicInput.description,
          }
        });

        for (const taskInput of epicInput.tasks) {
          taskCounter++;
          const taskKey = `${keyPrefix}-${taskCounter}`;

          await tx.task.create({
            data: {
              workspaceId,
              projectId,
              epicId: epic.id,
              key: taskKey,
              title: taskInput.title,
              description: taskInput.description,
              status: 'TODO',
              priority: taskInput.priority,
              storyPoints: taskInput.storyPoints || 1,
              acceptanceCriteria: JSON.stringify(taskInput.acceptanceCriteria)
            }
          });
        }
      }
    });

    this.logger.log(
      `[Database Service] Successfully committed ${epics.length} Epics to database for Project: ${projectId}`
    );
  }

  /**
   * Subscriber that binds to RabbitMQ and consumes PR review jobs.
   * Runs an OpenAI audit loop on the git code diff and publishes reviews directly on GitHub PRs.
   */
  @RabbitSubscribe({
    exchange: 'ai.exchange',
    routingKey: 'pr.review',
    queue: 'ai.queue::pr.review',
  })
  async handlePrReviewJob(message: {
    owner: string;
    repo: string;
    pullNumber: number;
    diff: string;
    taskSpec: string;
    workspaceId: string;
  }): Promise<void> {
    const { owner, repo, pullNumber, diff, taskSpec, workspaceId } = message;

    this.logger.log(`[RabbitMQ PR Consumer] Received PR review job for PR #${pullNumber} on repository ${owner}/${repo}`);

    try {
      // Invoke OpenAI audit completion call
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a Principal Software Engineer and Security Auditor. Your task is to perform an AI Guardrail Audit on a Git code diff, checking if it fully satisfies the provided Task Specification and acceptance criteria.
Be highly technical, concise, and audit for security vulnerabilities, edge-case coverage, and logical correctness. Provide your feedback directly as a structured Markdown review comment. Do not include introductory text, start directly with the critique items.`,
          },
          {
            role: 'user',
            content: `Task Specification:\n${taskSpec}\n\nCode Diff:\n${diff}`,
          },
        ],
        temperature: 0.2,
      });

      const reviewComment = response.choices[0]?.message?.content || 'AI review generated no feedback.';

      this.logger.log(`[RabbitMQ PR Consumer] Generated AI review comment of length ${reviewComment.length}`);

      if (this.octokitService.isEnabled()) {
        await this.octokitService.client!.issues.createComment({
          owner,
          repo,
          issue_number: pullNumber,
          body: `### 🛡️ AI Guardrail Code Audit\n\n${reviewComment}\n\n_Audit completed by SequenceJira Multi-Agent Pipeline._`,
        });
        this.logger.log(`[RabbitMQ PR Consumer] Successfully posted AI review comment to PR #${pullNumber}.`);
      } else {
        this.logger.log(`[Simulation Mode] AI review comment compiled. Skipping GitHub API posting.`);
        this.logger.log(`[Simulated Review Body]:\n${reviewComment}`);
      }

      // Notify frontend client log context
      this.eventsGateway.server.to(`workspace:${workspaceId}`).emit('pr:reviewed', {
        pullNumber,
        owner,
        repo,
        success: true,
      });

    } catch (err) {
      this.logger.error(`Failed to process PR review job: ${err.message}`, err.stack);
    }
  }
}
