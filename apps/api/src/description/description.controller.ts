import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UpdateDescInput, updateDescSchema } from '@yt/shared';
import { ZodValidationPipe } from '../projects/zod-validation.pipe';
import { DescriptionService } from './description.service';

@ApiTags('descrição')
@Controller('projects/:id/description')
export class DescriptionController {
  constructor(private readonly description: DescriptionService) {}

  @Get()
  get(@Param('id') id: string) {
    return this.description.response(id);
  }

  @Post('generate')
  generate(@Param('id') id: string) {
    return this.description.generate(id);
  }

  @Put()
  save(@Param('id') id: string, @Body(new ZodValidationPipe(updateDescSchema)) body: UpdateDescInput) {
    return this.description.save(id, body.descricao);
  }
}
