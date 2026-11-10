import { Module } from '@nestjs/common';
import { SupabaseController } from './supabase/supabase.controller';
import { SupabaseService } from './supabase/supabase.service';
import { LoginController } from './supabase/login.controller';
import { GitlabLoginController } from './git/gitlab.controller';
import { GithubLoginController } from './git/github.controller';
import { PipelineController } from './pipelines/pipeline.controller';
import { PipelineService } from './pipelines/pipeline.service';
import { WebhookController } from './git/webhook.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { config } from './config';
import { GithubService } from './git/github.service';
import { Users } from './model/user.entity';
import { ValidatorController } from './pipelines/validator.controller';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      ...config.db,
    }),
    TypeOrmModule.forFeature([Users]),
  ],
  controllers: [
    SupabaseController,
    LoginController,
    GitlabLoginController,
    GithubLoginController,
    PipelineController,
    WebhookController,
    ValidatorController
  ],
  providers: [SupabaseService, PipelineService, GithubService],
})
export class AppModule {}
