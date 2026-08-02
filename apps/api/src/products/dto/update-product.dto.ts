import { PartialType } from '@nestjs/mapped-types';
import { CreateProductDto } from './create-product.dto';

// isActive deliberately isn't editable here — see ProductsController's
// separate PATCH :id/status endpoint, gated by 'product:delete' rather than
// 'product:update' since deactivation is the sensitive action.
export class UpdateProductDto extends PartialType(CreateProductDto) {}
