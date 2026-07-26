import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EventsGateway } from './events.gateway';
import { OctokitService } from './octokit.service';
import { PrismaService } from './prisma.service';

export interface TaskStateUpdatePayload {
  taskId: string;
  workspaceId: string;
  projectId: string;
  newStatus: string;
  prUrl: string;
}

@Injectable()
export class GithubWebhookService {
  private readonly logger = new Logger(GithubWebhookService.name);

  constructor(
    private readonly rabbitMQ: AmqpConnection,
    private readonly eventsGateway: EventsGateway,
    private readonly octokitService: OctokitService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Processes the verified GitHub payload and triggers state adjustments.
   * 
   * @param event The x-github-event header string (e.g., 'pull_request')
   * @param payload Parsed JSON payload from GitHub webhook dispatch
   */
  async processWebhook(event: string, payload: any): Promise<void> {
    if (event !== 'pull_request') {
      this.logger.debug(`Skipping non-pull_request GitHub event type: ${event}`);
      return;
    }

    const { action, pull_request } = payload;
    if (!pull_request) return;

    const prTitle = pull_request.title || '';
    const branchName = pull_request.head?.ref || '';
    const prBody = pull_request.body || '';
    const prUrl = pull_request.html_url;
    const merged = pull_request.merged === true;

    this.logger.log(
      `[GitHub Webhook] Processing PR Action: "${action}" | Title: "${prTitle}" | Branch: "${branchName}"`
    );

    // Regex pattern matching keys like 'SEQ-104' or project key indicators
    const taskKeyPattern = /[A-Z]{2,10}-\d+/g;
    const matchedKeys = new Set<string>([
      ...(prTitle.match(taskKeyPattern) || []),
      ...(branchName.match(taskKeyPattern) || []),
      ...(prBody.match(taskKeyPattern) || [])
    ]);

    if (matchedKeys.size === 0) {
      this.logger.debug('No task key reference detected in PR metadata. Gracefully skipping.');
      return;
    }

    this.logger.log(`Matched task keys for transition: ${Array.from(matchedKeys).join(', ')}`);

    for (const key of matchedKeys) {
      try {
        // Query Database layer to fetch Task details
        const task = await this.prisma.task.findUnique({
          where: { key }
        });
        if (!task) {
          this.logger.warn(`Task metadata not found in database for key: ${key}`);
          continue;
        }

        if (action === 'opened' || action === 'synchronize') {
          // Transition status to IN_REVIEW
          await this.prisma.task.update({
            where: { id: task.id },
            data: {
              status: 'IN_REVIEW',
              pullRequestUrl: prUrl
            }
          });
          this.logger.log(`Task ${key} transitioned to IN_REVIEW due to PR activity.`);

          // Log Audit Record
          await this.prisma.auditLog.create({
            data: {
              workspaceId: task.workspaceId,
              actorType: 'SYSTEM_WEBHOOK',
              actionType: 'GITHUB_PR_OPENED',
              entityName: 'tasks',
              entityId: task.id,
              newValues: JSON.stringify({ status: 'IN_REVIEW', detail: `GitHub PR opened/synchronized: ${prUrl}` })
            }
          });

          // Broadcast real-time change to all workspace developers
          this.eventsGateway.server.to(`workspace:${task.workspaceId}`).emit('task:moved', {
            taskId: task.id,
            newStatus: 'IN_REVIEW',
            updatedBy: 'SYSTEM_GITHUB_WEBHOOK',
          });
        } 
        else if (action === 'closed' && merged) {
          // Transition status to DONE
          await this.prisma.task.update({
            where: { id: task.id },
            data: {
              status: 'DONE',
              pullRequestUrl: prUrl
            }
          });
          this.logger.log(`Task ${key} transitioned to DONE due to PR merge.`);

          // Log Audit Record
          await this.prisma.auditLog.create({
            data: {
              workspaceId: task.workspaceId,
              actorType: 'SYSTEM_WEBHOOK',
              actionType: 'GITHUB_PR_MERGED',
              entityName: 'tasks',
              entityId: task.id,
              newValues: JSON.stringify({ status: 'DONE', detail: `GitHub PR merged: ${prUrl}` })
            }
          });

          // Broadcast real-time change to workspace
          this.eventsGateway.server.to(`workspace:${task.workspaceId}`).emit('task:moved', {
            taskId: task.id,
            newStatus: 'DONE',
            updatedBy: 'SYSTEM_GITHUB_WEBHOOK',
          });

          // Publish async cleanup event to RabbitMQ
          await this.rabbitMQ.publish(
            'git.exchange',
            'webhook.cleanup',
            {
              taskId: task.id,
              branchName,
              workspaceId: task.workspaceId,
              prUrl
            }
          );
          this.logger.log(`Enqueued cleanup event for branch "${branchName}" to RabbitMQ.`);
        }
      } catch (err) {
        this.logger.error(
          `Failed to process task state transition for key ${key}: ${err.message}`,
          err.stack
        );
      }
    }
  }

  /**
   * Secure PR Webhook validation processing.
   * Pulls raw code diff via Octokit, searches the database for task requirements,
   * and routes a structured payload to RabbitMQ for asynchronous AI audit comment creation.
   */
  async processPrWebhook(event: string, payload: any): Promise<void> {
    if (event !== 'pull_request') return;

    const { action, number, pull_request, repository } = payload;
    if (!pull_request || !repository) return;

    // Trigger AI reviews only when PR is opened or synced with new commits
    if (action !== 'opened' && action !== 'synchronize') {
      this.logger.debug(`Skipping PR action "${action}" for AI audit.`);
      return;
    }

    const prNumber = number;
    const repoOwner = repository.owner?.login;
    const repoName = repository.name;
    const branchName = pull_request.head?.ref || '';
    const prUrl = pull_request.html_url;

    this.logger.log(`Processing PR webhook for AI review: ${repoOwner}/${repoName}#${prNumber} on branch "${branchName}"`);

    let diff = '';
    if (this.octokitService.isEnabled()) {
      try {
        const res = await this.octokitService.client!.pulls.get({
          owner: repoOwner,
          repo: repoName,
          pull_number: prNumber,
          headers: {
            accept: 'application/vnd.github.v3.diff',
          },
        });
        diff = String(res.data);
        this.logger.log(`Successfully fetched raw pull request diff from GitHub API.`);
      } catch (err) {
        this.logger.error(`Failed to pull PR code diff: ${err.message}. Falling back to simulation diff.`);
        diff = `--- a/apps/web/components/kanban/KanbanBoard.tsx\n+++ b/apps/web/components/kanban/KanbanBoard.tsx\n@@ -20,2 +20,3 @@\n+  // AI PR reviewer validation test injection check\n+  console.log("simulated diff");`;
      }
    } else {
      this.logger.log(`[Simulation Mode] Using simulated PR code diff.`);
      diff = `--- a/apps/web/components/kanban/KanbanBoard.tsx\n+++ b/apps/web/components/kanban/KanbanBoard.tsx\n@@ -20,2 +20,3 @@\n+  // AI PR reviewer validation test injection check\n+  console.log("simulated diff");`;
    }

    // Match task from database based on branch name
    const matchedTask = await this.prisma.task.findFirst({
      where: { branchName }
    });

    let acList: string[] = [];
    if (matchedTask?.acceptanceCriteria) {
      try {
        acList = JSON.parse(matchedTask.acceptanceCriteria);
      } catch (err) {
        acList = [];
      }
    }

    const taskSpec = matchedTask 
      ? `Task Title: ${matchedTask.title}\nDescription: ${matchedTask.description}\nAcceptance Criteria:\n${acList.map((ac: string) => `- ${ac}`).join('\n') || 'N/A'}`
      : 'Generic spec: Verify that PR additions compile cleanly and execute basic security middleware checks.';

    // Publish PR review request to RabbitMQ
    await this.rabbitMQ.publish(
      'ai.exchange',
      'pr.review',
      {
        owner: repoOwner,
        repo: repoName,
        pullNumber: prNumber,
        diff,
        taskSpec,
        workspaceId: matchedTask?.workspaceId || '11111111-1111-1111-1111-111111111111',
      }
    );

    this.logger.log(`Published PR review payload to RabbitMQ for PR #${prNumber}`);
  }
}
