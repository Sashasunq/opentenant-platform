import { Module } from '@nestjs/common';
import { AppController } from './supabase/supabase.controller';
import { AppService } from './supabase/supabase.service';
import { LoginController } from './supabase/login.controller';
import { GitlabLoginController } from './git/gitlab.controller';
import { GithubLoginController } from './git/github.controller';
import { PipelineController } from './pipelines/pipeline.controller';
import { PipelineService } from './pipelines/pipeline.service';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [],
  controllers: [
    AppController,
    LoginController,
    GitlabLoginController,
    GithubLoginController,
    PipelineController,
    WebhookController,
  ],
  providers: [AppService, PipelineService],
})
export class AppModule {}
