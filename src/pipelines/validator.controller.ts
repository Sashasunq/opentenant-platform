import { Controller, Get, Param, Post } from "@nestjs/common";
import { PipelineService } from "./pipeline.service";
import { ApiParam } from "@nestjs/swagger";

@Controller('validator')
export class ValidatorController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Get('pipeline/:projectId/:userId')
  @ApiParam({ name: 'projectId' })
  @ApiParam({ name: 'userId' })
  async getPipeline(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string
  ) {
    return this.pipelineService.getPipelineBranch(userId, projectId);
  }
}