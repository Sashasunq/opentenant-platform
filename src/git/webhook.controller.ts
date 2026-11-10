import {
  Controller,
  Post,
  Headers,
  Req,
  Res,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PipelineService } from '../pipelines/pipeline.service';
import * as crypto from 'crypto';

@Controller('git/webhook')
export class WebhookController {
  constructor(private readonly pipelineService: PipelineService) {}

  // GitHub webhook
  @Post('github')
  async githubWebhook(
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-event') event: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!signature || !event) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Missing headers' });
    }

    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      console.error('GITHUB_WEBHOOK_SECRET not set');
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: 'Webhook secret not configured' });
    }

    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Missing raw body' });
    }

    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    if (`sha256=${expected}` !== signature) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ error: 'Invalid signature' });
    }

    const body = req.body;
    if (event === 'push') {
      const repoFullName = body.repository?.full_name;
      const ref = body.ref;
      const commitSha = body.after;
      if (!repoFullName || !ref || !commitSha) {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ error: 'Missing push data' });
      }

      try {
        await this.pipelineService.applyMigrationFromWebhook(
          repoFullName,
          commitSha,
        );
        return res.status(HttpStatus.OK).json({ status: 'migration applied' });
      } catch (err) {
        console.error('Webhook migration error:', err);
        return res
          .status(HttpStatus.INTERNAL_SERVER_ERROR)
          .json({ error: String(err) });
      }
    }

    return res.status(HttpStatus.OK).json({ status: 'ignored' });
  }

  // GitLab webhook
  @Post('gitlab')
  async gitlabWebhook(
    @Headers('x-gitlab-token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!token) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Missing X-Gitlab-Token' });
    }

    const secret = process.env.GITLAB_WEBHOOK_SECRET;
    if (!secret) {
      console.error('GITLAB_WEBHOOK_SECRET not set');
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: 'Webhook secret not configured' });
    }

    if (token !== secret) {
      return res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ error: 'Invalid token' });
    }

    const body = req.body;
    const event = req.headers['x-gitlab-event'] as string;
    if (event === 'Push Hook') {
      const repoFullName = body.project?.path_with_namespace;
      const ref = body.ref;
      const commitSha = body.after;
      if (!repoFullName || !ref || !commitSha) {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ error: 'Missing push data' });
      }

      try {
        await this.pipelineService.applyMigrationFromWebhook(
          repoFullName,
          commitSha,
        );
        return res.status(HttpStatus.OK).json({ status: 'migration applied' });
      } catch (err) {
        console.error('Webhook migration error:', err);
        return res
          .status(HttpStatus.INTERNAL_SERVER_ERROR)
          .json({ error: String(err) });
      }
    }

    return res.status(HttpStatus.OK).json({ status: 'ignored' });
  }
}
