import { Injectable, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

// 1. Define the input payload interface
export interface AnalyzeRequirementsInput {
  workspaceId: string;
  projectId: string;
  rawRequirements: string;
}

// 2. Define the strict verification schema using Zod
export const RequirementsAnalysisSchema = z.object({
  extracted_scope: z.string().describe(
    'A concise, deeply technical summary of the scope and core architectural changes required.'
  ),
  system_boundaries: z.array(z.string()).describe(
    'An array of system areas affected (e.g., "Database", "Authentication", "External API Payment Integration", "WebSocket Broker", "UI Components").'
  ),
  suggested_epics: z.array(
    z.object({
      title: z.string().describe('A concise, title-cased name for the Epic (e.g., "Stripe Billing Infrastructure").'),
      description: z.string().describe('Detailed description of the epic scope, technical limits, and requirements.')
    })
  ).describe('A logical partitioning of the requirements into high-level features/Epics.')
});

// Infer TypeScript type from Zod schema
export type RequirementsAnalysisResult = z.infer<typeof RequirementsAnalysisSchema>;

@Injectable()
export class RequirementsAnalyzerService {
  private readonly logger = new Logger(RequirementsAnalyzerService.name);
  private readonly openai: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY environment variable is not defined.');
    }
    // Initialize OpenAI client configured for custom Base URL / GitHub Models
    this.openai = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL,
    });
  }

  /**
   * Parses raw user intent/requirements and converts them into structured system boundaries and epics.
   * Runs as Agent 1 (Requirements Analyzer) in the multi-agent task breakdown pipeline.
   * 
   * @param input AnalyzeRequirementsInput payload
   * @returns Promise<RequirementsAnalysisResult>
   */
  async analyze(input: AnalyzeRequirementsInput): Promise<RequirementsAnalysisResult> {
    const { workspaceId, projectId, rawRequirements } = input;

    if (!rawRequirements || rawRequirements.trim().length === 0) {
      throw new BadRequestException('Raw requirements payload cannot be empty.');
    }

    this.logger.log(
      `Starting requirements analysis for Workspace: ${workspaceId}, Project: ${projectId}`
    );

    const systemPrompt = `You are a Principal Software Architect and Technical Product Owner. 
Your role is to analyze raw product requirements, extract a concise technical scope, identify the exact system boundaries affected, and group the work into high-level logical Epics.

Guidelines:
1. Be technical and precise. Avoid generic descriptions.
2. Group logical blocks of work into distinct Epics. For example, database setup, frontend state, backend routing, third-party integrations should be mapped clearly.
3. System boundaries must specify real technical layers (e.g., "Prisma Schema", "NestJS Route Handler", "Redis Caching Layer", "Stripe API Webhook").

You must return your output strictly matching the schema format.`;

    const userPrompt = `Workspace ID: ${workspaceId}
Project ID: ${projectId}

Raw Product Requirements Description:
---
${rawRequirements}
---`;

    try {
      // Call OpenAI using structured output format
      const response = await this.openai.chat.completions.parse({
        model: process.env.OPENAI_MODEL || 'gpt-4o', // Or 'gpt-4o-mini' depending on cost/performance tradeoffs
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: zodResponseFormat(RequirementsAnalysisSchema, 'requirements_analysis'),
        temperature: 0.1, // Keep temperature low to preserve structure consistency and deter hallucinations
      });

      const structuredResult = response.choices[0]?.message.parsed;

      if (!structuredResult) {
        throw new Error('LLM failed to output parsed JSON structure.');
      }

      this.logger.log(
        `Successfully analyzed requirements. Extracted ${structuredResult.suggested_epics.length} Epics.`
      );

      return structuredResult;

    } catch (error) {
      this.logger.error(
        `Failed to run Requirements Analyzer for Project ${projectId}: ${error.message}`,
        error.stack
      );

      // Perform validation check or throw structural failure errors
      if (error instanceof z.ZodError) {
        throw new InternalServerErrorException({
          message: 'LLM response failed strict schema validation checks.',
          details: error.issues,
        });
      }

      throw new InternalServerErrorException(
        `Requirements analysis pipeline execution failed: ${error.message}`
      );
    }
  }
}
