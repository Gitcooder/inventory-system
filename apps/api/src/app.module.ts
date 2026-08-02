import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { loggerConfig } from './common/logger.config';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RbacModule } from './rbac/rbac.module';
import { PermissionsGuard } from './rbac/permissions.guard';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { BrandsModule } from './brands/brands.module';
import { CategoriesModule } from './categories/categories.module';
import { LocationsModule } from './locations/locations.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { DispenseModule } from './dispense/dispense.module';
import { AlertsModule } from './alerts/alerts.module';
import { ReviewsModule } from './reviews/reviews.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot(loggerConfig),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    RedisModule,
    RbacModule,
    AuthModule,
    UsersModule,
    RolesModule,
    BrandsModule,
    CategoriesModule,
    LocationsModule,
    ProductsModule,
    InventoryModule,
    DispenseModule,
    AlertsModule,
    ReviewsModule,
    AuditLogModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Order matters: every request must pass rate limiting, then prove who it
    // is (JwtAuthGuard, unless @Public()), then prove it's allowed to do this
    // specific thing (PermissionsGuard, only when @RequirePermissions() is set).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
