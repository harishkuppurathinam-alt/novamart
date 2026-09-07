import prisma from '../db/prisma';

export class ReportingService {
  /**
   * Get sales for today.
   */
  static async getTodaySales() {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    return this.getSalesForPeriod(startOfDay, endOfDay);
  }

  /**
   * Get sales for a specific date period.
   */
  static async getSalesForPeriod(startDate: Date | string, endDate: Date | string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const bills = await prisma.bill.findMany({
      where: {
        status: 'FINALIZED',
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      include: {
        items: true,
      },
    });

    let totalSubtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalSales = 0;
    let totalItemsSold = 0;

    const paymentBreakdown: Record<string, { count: number; total: number }> = {
      UPI: { count: 0, total: 0 },
      CASH: { count: 0, total: 0 },
      CARD: { count: 0, total: 0 },
      CREDIT: { count: 0, total: 0 },
    };

    for (const bill of bills) {
      totalSubtotal += bill.subtotal;
      totalCgst += bill.cgst;
      totalSgst += bill.sgst;
      totalSales += bill.total;

      const method = bill.paymentMethod?.toUpperCase() || 'OTHER';
      if (!paymentBreakdown[method]) {
        paymentBreakdown[method] = { count: 0, total: 0 };
      }
      paymentBreakdown[method].count += 1;
      paymentBreakdown[method].total = Math.round((paymentBreakdown[method].total + bill.total) * 100) / 100;

      for (const item of bill.items) {
        totalItemsSold += item.quantity;
      }
    }

    return {
      period: `${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}`,
      totalBills: bills.length,
      totalSubtotal: Math.round(totalSubtotal * 100) / 100,
      totalCgst: Math.round(totalCgst * 100) / 100,
      totalSgst: Math.round(totalSgst * 100) / 100,
      totalGst: Math.round((totalCgst + totalSgst) * 100) / 100,
      totalSales: Math.round(totalSales * 100) / 100,
      totalItemsSold,
      averageBillValue: bills.length > 0 ? Math.round((totalSales / bills.length) * 100) / 100 : 0,
      paymentBreakdown,
    };
  }

  /**
   * Get top selling products by quantity and revenue.
   */
  static async getTopSellingProducts(limit: number = 5) {
    const items = await prisma.billItem.findMany({
      where: {
        bill: { status: 'FINALIZED' },
      },
    });

    const productSalesMap = new Map<string, { productName: string; quantity: number; revenue: number }>();

    for (const item of items) {
      const existing = productSalesMap.get(item.productNameSnapshot) || {
        productName: item.productNameSnapshot,
        quantity: 0,
        revenue: 0,
      };
      existing.quantity += item.quantity;
      existing.revenue += item.lineTotal;
      productSalesMap.set(item.productNameSnapshot, existing);
    }

    return Array.from(productSalesMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit);
  }

  /**
   * Get payment method breakdown across all finalized bills.
   */
  static async getPaymentBreakdown() {
    const bills = await prisma.bill.findMany({
      where: { status: 'FINALIZED' },
    });

    const breakdown: Record<string, { count: number; totalAmount: number }> = {
      UPI: { count: 0, totalAmount: 0 },
      CASH: { count: 0, totalAmount: 0 },
      CARD: { count: 0, totalAmount: 0 },
      CREDIT: { count: 0, totalAmount: 0 },
    };

    for (const bill of bills) {
      const method = bill.paymentMethod?.toUpperCase() || 'OTHER';
      if (!breakdown[method]) {
        breakdown[method] = { count: 0, totalAmount: 0 };
      }
      breakdown[method].count += 1;
      breakdown[method].totalAmount =
        Math.round((breakdown[method].totalAmount + bill.total) * 100) / 100;
    }

    return breakdown;
  }

  /**
   * Get low stock products (stockQuantity <= reorderLevel).
   */
  static async getLowStockProducts() {
    return prisma.product.findMany({
      where: {
        active: true,
        stockQuantity: {
          lte: prisma.product.fields.reorderLevel,
        },
      },
      orderBy: { stockQuantity: 'asc' },
    });
  }
}
