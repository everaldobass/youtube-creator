import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UpdateTagsInput, updateTagsSchema } from '@yt/shared';
import { ZodValidationPipe } from '../projects/zod-validation.pipe';
import { TagsService } from './tags.service';

@ApiTags('tags')
@Controller('projects/:id/tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  list(@Param('id') id: string) {
    return this.tags.list(id);
  }

  @Post('generate')
  generate(@Param('id') id: string) {
    return this.tags.generate(id);
  }

  @Put()
  save(@Param('id') id: string, @Body(new ZodValidationPipe(updateTagsSchema)) body: UpdateTagsInput) {
    return this.tags.save(id, body.tags);
  }
}
