import { ReportingService } from './reporting.service';

export class ReportsService {
  static async getDailySales(dateStr?: string) {
    return ReportingService.getTodaySales();
  }

  static async getWeeklySales() {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);
    return ReportingService.getSalesForPeriod(start, end);
  }

  static async getTopSellingProducts(limit: number = 5) {
    return ReportingService.getTopSellingProducts(limit);
  }

  static async getPaymentBreakdown() {
    return ReportingService.getPaymentBreakdown();
  }
}
