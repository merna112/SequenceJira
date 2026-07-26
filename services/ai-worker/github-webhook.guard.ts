import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class GithubWebhookGuard implements CanActivate {
  /**
   * Verifies the authenticity of incoming GitHub payload webhooks.
   * Leverages cryptographically safe, timing-resistant comparisons.
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const signature = request.headers['x-hub-signature-256'] as string;
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new UnauthorizedException('System Configuration Error: GITHUB_WEBHOOK_SECRET is not defined.');
    }

    if (!signature) {
      throw new UnauthorizedException('Signature mismatch: x-hub-signature-256 header is missing.');
    }

    // In a standard NestJS setup configured with rawBody: true, request.rawBody holds the Buffer.
    // Fallback to JSON.stringify(request.body) if rawBody is not enabled (Warning: JSON stringification can alter spacing/order).
    const rawBody = request.rawBody 
      ? request.rawBody 
      : Buffer.from(JSON.stringify(request.body));

    const hmac = crypto.createHmac('sha256', webhookSecret);
    const calculatedSignature = `sha256=${hmac.update(rawBody).digest('hex')}`;

    try {
      const isSignatureValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(calculatedSignature)
      );

      if (!isSignatureValid) {
        throw new UnauthorizedException('Verification failed: Signature verification failed.');
      }
    } catch (err) {
      throw new UnauthorizedException('Verification failed: Signature validation failed.');
    }

    return true;
  }
}
