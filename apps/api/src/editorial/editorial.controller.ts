import { Controller, Get, Param, Post } from '@nestjs/common';
import { EditorialService } from './editorial.service';

@Controller()
export class EditorialController {
  constructor(private readonly editorial: EditorialService) {}

  @Get('projects/:id/editorial')
  status(@Param('id') id: string) {
    return this.editorial.response(id);
  }

  @Post('projects/:id/editorial/review')
  review(@Param('id') id: string) {
    return this.editorial.review(id);
  }

  @Post('editorial/issues/:issueId/accept')
  accept(@Param('issueId') issueId: string) {
    return this.editorial.accept(issueId);
  }

  @Post('editorial/issues/:issueId/reject')
  reject(@Param('issueId') issueId: string) {
    return this.editorial.reject(issueId);
  }
}
