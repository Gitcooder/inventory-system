import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ModerateReviewDto } from './dto/moderate-review.dto';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { QueryModerationDto } from './dto/query-moderation.dto';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  // Public: anyone can read approved reviews without an account, same as
  // browsing the catalog itself. Note this means the seeded 'review:view'
  // permission (held by Employee and Customer) is currently unused — public
  // browsing supersedes it. It's left in the seed as the natural permission
  // to gate a future authenticated-only view (e.g. "my reviews") behind.
  @Public()
  @Get()
  listPublic(@Query() query: QueryReviewsDto) {
    return this.reviews.listPublic(query);
  }

  // The moderation queue is a distinct route (not an admin-only status param
  // on the public endpoint above) specifically so there's no query-string
  // path from the public, unauthenticated route to pending/rejected content.
  @RequirePermissions('review:moderate')
  @Get('moderation')
  listForModeration(@Query() query: QueryModerationDto) {
    return this.reviews.listForModeration(query);
  }

  @RequirePermissions('review:create')
  @Post()
  create(@Body() dto: CreateReviewDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reviews.create(user.id, dto);
  }

  @RequirePermissions('review:moderate')
  @Patch(':id/moderate')
  moderate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModerateReviewDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.reviews.moderate(id, dto.status, actor.id, req.ip);
  }
}
