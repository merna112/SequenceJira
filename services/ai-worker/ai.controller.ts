import { Controller, Post, Get, Body, Headers, HttpCode, HttpStatus, BadRequestException, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from './prisma.service';
import * as crypto from 'crypto';

@Controller('api/v1/ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly rabbitMQ: AmqpConnection,
    private readonly prisma: PrismaService
  ) {}

  /**
   * HTTP Endpoint to trigger the Multi-Agent task decomposition.
   * Enqueues the job into RabbitMQ and returns immediately (HTTP 202 Accepted) to keep clients responsive.
   * 
   * @param workspaceId Header parameter isolated per tenant
   * @param body Contains the projectId and requirements prompt
   */
  @Post('generate-tasks')
  @HttpCode(HttpStatus.ACCEPTED)
  async generateTasks(
    @Headers('x-workspace-id') workspaceId: string,
    @Body() body: { projectId: string; prompt: string }
  ) {
    if (!workspaceId) {
      throw new BadRequestException('x-workspace-id tenant header is required.');
    }

    const { projectId, prompt } = body;
    if (!projectId || !prompt) {
      throw new BadRequestException('Missing required fields: projectId or prompt.');
    }

    const jobId = crypto.randomUUID();

    this.logger.log(
      `[API Gateway] Received Task Generation Request for Workspace: ${workspaceId}, Project: ${projectId}. Queueing Job: ${jobId}`
    );

    // Publish execution job to RabbitMQ queue / in-memory handler fallback
    await this.rabbitMQ.publish(
      'ai.exchange',
      'task.generation',
      {
        jobId,
        workspaceId,
        projectId,
        userId: 'user-id-placeholder', // Mock resolved user identity from JWT Auth context
        prompt,
      }
    );

    return {
      jobId,
      status: 'PROCESSING',
      message: 'Task generation job successfully queued. Notifications will be broadcast via WebSockets on completion.'
    };
  }

  /**
   * HTTP Endpoint to load all tasks belonging to a specific workspace.
   */
  @Get('tasks')
  async getTasks(@Headers('x-workspace-id') workspaceId: string) {
    if (!workspaceId) {
      throw new BadRequestException('x-workspace-id tenant header is required.');
    }

    this.logger.log(`[API Gateway] Retrieving tasks for Workspace: ${workspaceId}`);

    const tasks = await this.prisma.task.findMany({
      where: { workspaceId },
      include: { epic: true }
    });

    // Map tasks to structural format expected by Kanban board frontend
    return tasks.map(task => {
      let acList: string[] = [];
      if (task.acceptanceCriteria) {
        try {
          acList = JSON.parse(task.acceptanceCriteria);
        } catch (err) {
          acList = [];
        }
      }

      return {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        storyPoints: task.storyPoints,
        acceptanceCriteria: acList,
        epicTitle: task.epic?.title || undefined,
        pullRequestUrl: task.pullRequestUrl || undefined,
        branchName: task.branchName || undefined,
        branchUrl: task.branchUrl || undefined
      };
    });
  }
}
