import { Injectable, Logger } from '@nestjs/common';
import { Octokit } from '@octokit/rest';

@Injectable()
export class OctokitService {
  private readonly logger = new Logger(OctokitService.name);
  public readonly client: Octokit | null = null;
  public readonly owner: string;
  public readonly repo: string;

  constructor() {
    const token = process.env.GITHUB_TOKEN;
    this.owner = process.env.GITHUB_OWNER || 'merna112';
    this.repo = process.env.GITHUB_REPO || 'SequenceJira';

    if (!token || token === 'your_personal_access_token_with_repo_scope') {
      this.logger.warn(
        'GITHUB_TOKEN environment variable is not defined or is set to placeholder. Octokit operations will run in simulated fallback mode.'
      );
      this.client = null;
    } else {
      this.client = new Octokit({ auth: token });
      this.logger.log(`GitHub integration initialized for repository: ${this.owner}/${this.repo}`);
    }
  }

  /**
   * Safe wrapper to check if live Octokit operations are enabled.
   */
  isEnabled(): boolean {
    return this.client !== null;
  }
}
export default OctokitService;
