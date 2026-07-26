import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { OctokitService } from './octokit.service';
import { PrismaService } from './prisma.service';
import slugify from 'slugify';

@WebSocketGateway({
  cors: {
    origin: '*', // Adjust to your frontend origins in production
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/realtime',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly octokitService: OctokitService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Handle WebSocket handshake, authentication, and logical room alignment.
   * Isolates users into rooms using their workspace IDs extracted from their JWT token credentials.
   * 
   * @param client Socket client connection instance
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      const authHeader = client.handshake.auth?.token || client.handshake.headers?.authorization;

      if (!authHeader) {
        this.logger.warn(`Disconnecting client ${client.id}: Authentication token is missing.`);
        client.disconnect(true);
        return;
      }

      const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
      
      // Decode and verify user JWT token credentials
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-jwt-secret') as any;

      // Extract user ID and authorized workspaces list
      client.data.userId = decoded.sub;
      client.data.workspaces = decoded.workspaces || [];

      // Join the socket instance to rooms matching the user's workspaces
      for (const workspaceId of client.data.workspaces) {
        const roomName = `workspace:${workspaceId}`;
        await client.join(roomName);
        this.logger.log(`Client ${client.id} joined WebSocket room: ${roomName}`);
      }

      this.logger.log(`Client ${client.id} authenticated successfully. User: ${client.data.userId}`);
    } catch (err) {
      this.logger.error(`Handshake connection failed for socket ${client.id}: ${err.message}`);
      client.disconnect(true);
    }
  }

  /**
   * Handle Client disconnect events.
   * 
   * @param client Socket client instance
   */
  handleDisconnect(client: Socket): void {
    this.logger.log(`Client ${client.id} disconnected.`);
  }

  /**
   * Enforces Kanban state synchronization. Drag-and-drop actions on cards
   * are broadcast to other developers working in the same room.
   */
  @SubscribeMessage('task:move')
  async handleTaskMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { taskId: string; workspaceId: string; newStatus: string }
  ): Promise<void> {
    const { taskId, workspaceId, newStatus } = payload;

    // Validate that the sender has rights to perform broadcasts in the workspace room
    if (!client.data.workspaces.includes(workspaceId)) {
      this.logger.warn(
        `Blocked unauthorized WebSocket broadcast from client ${client.id} to workspace:${workspaceId}`
      );
      client.emit('error', { message: 'Unauthorized workspace channel request.' });
      return;
    }

    const roomName = `workspace:${workspaceId}`;
    
    // Broadcast status change to other active clients in the room (excluding sender)
    client.to(roomName).emit('task:moved', {
      taskId,
      newStatus,
      updatedBy: client.data.userId,
    });

    this.logger.log(
      `Broadcast task move event: Task ${taskId} -> ${newStatus} within workspace:${workspaceId} by ${client.data.userId}`
    );

    // Automation: Create branch if transitioned to IN_PROGRESS
    try {
      if (newStatus === 'IN_PROGRESS') {
        const task = await this.prisma.task.findUnique({
          where: { id: taskId }
        });
        
        if (!task) {
          this.logger.warn(`Task ${taskId} not found in DB. Skipping database status sync.`);
          return;
        }

        if (!task.branchName) {
          const normalizedTitle = slugify(task.title, { lower: true, strict: true });
          const cleanTaskId = taskId.replace(/[^a-zA-Z0-9]/g, '').slice(-4);
          const branchName = `feature/${normalizedTitle}-${cleanTaskId}`;
          
          let branchUrl = `https://github.com/${this.octokitService.owner}/${this.octokitService.repo}/tree/${branchName}`;

          this.logger.log(`Initiating Git branch creation flow for task: "${task.title}" (Branch: ${branchName})...`);

          if (this.octokitService.isEnabled()) {
            try {
              const clientOcto = this.octokitService.client!;
              const owner = this.octokitService.owner;
              const repo = this.octokitService.repo;

              // Fetch default branch sha (main/master)
              const { data: refData } = await clientOcto.git.getRef({
                owner,
                repo,
                ref: 'heads/main',
              });
              const sha = refData.object.sha;

              // Create branch ref
              await clientOcto.git.createRef({
                owner,
                repo,
                ref: `refs/heads/${branchName}`,
                sha,
              });

              this.logger.log(`Successfully created branch ${branchName} on GitHub.`);
            } catch (gitErr) {
              this.logger.error(`GitHub API branch creation failed: ${gitErr.message}. Falling back to simulation mode.`);
            }
          } else {
            this.logger.log(`[Simulation Mode] Branch "${branchName}" registered in mock DB.`);
          }

          // Persist branch details to database
          await this.prisma.task.update({
            where: { id: taskId },
            data: {
              branchName,
              branchUrl,
              status: 'IN_PROGRESS'
            }
          });

          // Notify all clients in the room to display the Git branch badge
          this.server.to(roomName).emit('task:updated', {
            taskId,
            branchName,
            branchUrl,
            status: 'IN_PROGRESS',
          });
        } else {
          // Just update status
          await this.prisma.task.update({
            where: { id: taskId },
            data: { status: newStatus }
          });
        }
      } else {
        const taskExists = await this.prisma.task.findUnique({
          where: { id: taskId }
        });
        if (taskExists) {
          // Update status in DB
          await this.prisma.task.update({
            where: { id: taskId },
            data: { status: newStatus }
          });
        } else {
          this.logger.warn(`Task ${taskId} not found in DB. Skipping database status sync.`);
        }
      }
    } catch (dbErr) {
      this.logger.error(`Error persisting task status update to database: ${dbErr.message}`);
    }
  }

  /**
   * Service helper method to notify all clients in a Workspace about pipeline execution progress.
   */
  emitTaskGenerationProgress(workspaceId: string, step: number): void {
    const roomName = `workspace:${workspaceId}`;
    this.server.to(roomName).emit('task:generation_progress', { step });
    this.logger.log(`Broadcasted TASK_GENERATION_PROGRESS event to room: ${roomName} (Step: ${step})`);
  }

  /**
   * Service helper method to notify all clients in a Workspace that the
   * Multi-Agent task breakdown pipeline has completed execution.
   * 
   * @param workspaceId Workspace to target
   * @param payload Final analysis package data to broadcast
   */
  emitTaskGenerationCompleted(workspaceId: string, payload: any): void {
    const roomName = `workspace:${workspaceId}`;
    this.server.to(roomName).emit('task:generation_completed', payload);
    this.logger.log(`Broadcasted TASK_GENERATION_COMPLETED event to room: ${roomName}`);
  }
}
