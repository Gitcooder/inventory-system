import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { QueryUsageSummaryDto } from './dto/query-usage-summary.dto';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { toCsv } from '../common/csv.util';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RequirePermissions('report:view')
  @Get('usage-summary')
  usageSummary(@Query() query: QueryUsageSummaryDto) {
    return this.reports.usageSummary(query);
  }

  @RequirePermissions('report:view')
  @Get('usage-summary/export')
  async exportUsageSummary(
    @Query() query: QueryUsageSummaryDto,
    @Res() res: Response,
  ) {
    const rows = await this.reports.usageSummary(query);
    const csv = toCsv(rows, [
      { header: 'Product', value: (r) => r.productName },
      { header: 'SKU', value: (r) => r.skuCode },
      { header: 'Times Dispensed', value: (r) => r.timesDispensed },
      {
        header: 'Total Quantity Dispensed',
        value: (r) => r.totalQuantityDispensed,
      },
    ]);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="usage-summary.csv"',
    );
    res.send(csv);
  }
}
