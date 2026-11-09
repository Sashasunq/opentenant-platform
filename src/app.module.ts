import { Module } from '@nestjs/common';
import { SupabaseController } from './supabase/supabase.controller';
import { SupabaseService } from './supabase/supabase.service';
import { LoginController } from './supabase/login.controller';
import { GitlabLoginController } from './git/gitlab.controller';
import { GithubLoginController } from './git/github.controller';
import { PipelineController } from './pipelines/pipeline.controller';
import { PipelineService } from './pipelines/pipeline.service';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [],
  controllers: [
    SupabaseController,
    LoginController,
    GitlabLoginController,
    GithubLoginController,
    PipelineController,
    WebhookController,
  ],
  providers: [SupabaseService, PipelineService],
})
export class AppModule {}
