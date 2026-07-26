import { Module } from '@nestjs/common';
import { RabbitMQModule, AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { RequirementsAnalyzerService } from './requirements-analyzer.service';
import { EpicStoryGeneratorService } from './epic-story-generator.service';
import { QASelfCorrectionValidatorService } from './qa-self-correction-validator.service';
import { AiTaskConsumerService } from './ai-task-consumer.service';
import { EventsGateway } from './events.gateway';
import { GithubWebhookService } from './github-webhook.service';
import { GithubWebhookController } from './github-webhook.controller';
import { AiController } from './ai.controller';
import { OctokitService } from './octokit.service';
import { PrismaService } from './prisma.service';

const isRabbitMQEnabled = process.env.RABBITMQ_ENABLED === 'true';

@Module({
  imports: isRabbitMQEnabled
    ? [
        RabbitMQModule.forRoot({
          exchanges: [
            {
              name: 'ai.exchange',
              type: 'direct',
            },
            {
              name: 'git.exchange',
              type: 'topic',
            },
          ],
          uri: process.env.RABBITMQ_URI || 'amqp://guest:guest@localhost:5672',
          connectionInitOptions: { wait: false },
        }),
      ]
    : [],
  controllers: [
    AiController, 
    GithubWebhookController
  ],
  providers: [
    RequirementsAnalyzerService,
    EpicStoryGeneratorService,
    QASelfCorrectionValidatorService,
    AiTaskConsumerService,
    EventsGateway,
    GithubWebhookService,
    OctokitService,
    PrismaService,
    ...(!isRabbitMQEnabled
      ? [
          {
            provide: AmqpConnection,
            useFactory: (aiTaskConsumer: AiTaskConsumerService) => {
              return {
                publish: async (exchange: string, routingKey: string, message: any) => {
                  if (routingKey === 'task.generation') {
                    setTimeout(() => {
                      aiTaskConsumer.handleTaskGenerationJob(message).catch(err => {
                        console.error('In-memory handleTaskGenerationJob failed:', err);
                      });
                    }, 0);
                  } else if (routingKey === 'pr.review') {
                    setTimeout(() => {
                      aiTaskConsumer.handlePrReviewJob(message).catch(err => {
                        console.error('In-memory handlePrReviewJob failed:', err);
                      });
                    }, 0);
                  }
                },
              } as any;
            },
            inject: [AiTaskConsumerService],
          },
        ]
      : []),
  ],
  exports: [PrismaService],
})
export class AiWorkerModule {}
