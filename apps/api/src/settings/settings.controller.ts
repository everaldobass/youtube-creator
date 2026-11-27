import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AiSettingsDto,
  ProvedorIa,
  testarProvedorIaSchema,
  TestarProvedorIaInput,
  updateProvedorIaSchema,
  UpdateProvedorIaInput,
} from '@yt/shared';
import { ZodValidationPipe } from '../projects/zod-validation.pipe';
import { SettingsService } from './settings.service';

@ApiTags('configurações')
@Controller('settings/ai')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(): Promise<AiSettingsDto> {
    return this.settings.obter();
  }

  @Put(':provedor')
  update(
    @Param('provedor') provedor: ProvedorIa,
    @Body(new ZodValidationPipe(updateProvedorIaSchema)) body: UpdateProvedorIaInput,
  ): Promise<AiSettingsDto> {
    return this.settings.atualizar(provedor, body);
  }

  @Post('testar')
  testar(@Body(new ZodValidationPipe(testarProvedorIaSchema)) body: TestarProvedorIaInput) {
    return this.settings.testar(body.provedor);
  }
}
