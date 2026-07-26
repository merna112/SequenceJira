import { 
  Controller, 
  Post, 
  Headers, 
  Body, 
  UseGuards, 
  HttpCode, 
  HttpStatus, 
  Logger 
} from '@nestjs/common';
import { GithubWebhookGuard } from './github-webhook.guard';
import { GithubWebhookService } from './github-webhook.service';

@Controller('api/v1/webhooks')
export class GithubWebhookController {
  private readonly logger = new Logger(GithubWebhookController.name);

  constructor(private readonly webhookService: GithubWebhookService) {}

  /**
   * Secure ingress endpoint receiving payload dispatches from GitHub repositories.
   * Signature authenticity is enforced by the GithubWebhookGuard.
   * 
   * @param event String identifying the trigger event (from header: x-github-event)
   * @param payload Body object containing the event details
   */
  @Post('github')
  @UseGuards(GithubWebhookGuard)
  @HttpCode(HttpStatus.OK)
  async handleGithubWebhook(
    @Headers('x-github-event') event: string,
    @Body() payload: any
  ): Promise<{ processed: boolean }> {
    this.logger.log(`Received GitHub Webhook Event: ${event}. Beginning verification...`);

    // Delegate payload parsing and task updating workflows to the service layer
    await this.webhookService.processWebhook(event, payload);

    return { processed: true };
  }

  @Post('github/pr')
  @UseGuards(GithubWebhookGuard)
  @HttpCode(HttpStatus.OK)
  async handleGithubPrWebhook(
    @Headers('x-github-event') event: string,
    @Body() payload: any
  ): Promise<{ processed: boolean }> {
    this.logger.log(`Received GitHub PR Webhook Event: ${event}. Invoking verification pipelines...`);
    
    // Process the PR review asynchronously to ensure non-blocking, sub-second webhook ingress
    this.webhookService.processPrWebhook(event, payload).catch((err) => {
      this.logger.error(`Async PR webhook review workflow failed: ${err.message}`, err.stack);
    });

    return { processed: true };
  }
}
