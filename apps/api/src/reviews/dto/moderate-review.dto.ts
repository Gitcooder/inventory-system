import { IsIn } from 'class-validator';
import { REVIEW_STATUSES, type ReviewStatus } from '../review-status';

export class ModerateReviewDto {
  // 'pending' isn't a valid moderation target — you approve or reject, you
  // don't send something back to pending (resubmission via CreateReviewDto
  // does that automatically instead).
  @IsIn(REVIEW_STATUSES.filter((s) => s !== 'pending'))
  status: Exclude<ReviewStatus, 'pending'>;
}
