import PptxGenJS from 'pptxgenjs';
import fs from 'fs';
import path from 'path';
import { ReportingService } from './reporting.service';

export class PPTXService {
  /**
   * Generate 3-slide Sales Analysis PPTX presentation.
   */
  static async generateSalesAnalysisPPTX(period: string = 'today'): Promise<string> {
    const todayReport = await ReportingService.getTodaySales();
    const topProducts = await ReportingService.getTopSellingProducts(5);
    const lowStockItems = await ReportingService.getLowStockProducts();
    const paymentBreakdown = await ReportingService.getPaymentBreakdown();

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';

    // Slide 1: Executive Sales Overview
    const slide1 = pptx.addSlide();
    slide1.background = { color: '1B4332' };

    slide1.addText('NovaMart Supermarket', {
      x: 0.8,
      y: 0.8,
      w: 8,
      h: 0.6,
      fontSize: 22,
      color: 'B7E4C7',
    });

    slide1.addText('SALES OVERVIEW REPORT', {
      x: 0.8,
      y: 1.5,
      w: 8,
      h: 0.8,
      fontSize: 32,
      color: 'FFFFFF',
      bold: true,
    });

    slide1.addText(`Total Revenue: ₹${todayReport.totalSales}  |  Total Bills: ${todayReport.totalBills}  |  GST Collected: ₹${todayReport.totalGst}`, {
      x: 0.8,
      y: 2.5,
      w: 9,
      h: 0.5,
      fontSize: 16,
      color: 'D8F3DC',
    });

    // Slide 2: Top Selling Products
    const slide2 = pptx.addSlide();
    slide2.addText('Top Selling Products', {
      x: 0.8,
      y: 0.5,
      w: 8,
      h: 0.6,
      fontSize: 24,
      color: '1B4332',
      bold: true,
    });

    const tableRows: PptxGenJS.TableRow[] = [
      [
        { text: 'Product Name', options: { bold: true, fill: { color: '2D6A4F' }, color: 'FFFFFF' } },
        { text: 'Quantity Sold', options: { bold: true, fill: { color: '2D6A4F' }, color: 'FFFFFF' } },
        { text: 'Total Revenue (₹)', options: { bold: true, fill: { color: '2D6A4F' }, color: 'FFFFFF' } },
      ],
      ...(topProducts.length > 0
        ? topProducts.map((p) => [
            { text: p.productName, options: { fill: { color: 'F8F9FA' } } },
            { text: String(p.quantity), options: { fill: { color: 'F8F9FA' } } },
            { text: `₹${p.revenue.toFixed(2)}`, options: { fill: { color: 'F8F9FA' } } },
          ])
        : [
            [
              { text: 'No sales recorded yet', options: { fill: { color: 'F8F9FA' } } },
              { text: '0', options: { fill: { color: 'F8F9FA' } } },
              { text: '₹0.00', options: { fill: { color: 'F8F9FA' } } },
            ],
          ]),
    ];

    slide2.addTable(tableRows, {
      x: 0.8,
      y: 1.5,
      w: 8.4,
      colW: [4.0, 2.0, 2.4],
      fontSize: 14,
    });

    // Slide 3: Inventory & Business Insights
    const slide3 = pptx.addSlide();
    slide3.addText('Inventory & Payment Insights', {
      x: 0.8,
      y: 0.5,
      w: 8,
      h: 0.6,
      fontSize: 24,
      color: '1B4332',
      bold: true,
    });

    const lowStockText =
      lowStockItems.length > 0
        ? lowStockItems.map((item) => `• ${item.name}: ${item.stockQuantity} ${item.unit} left`).join('\n')
        : '• All products have healthy stock levels.';

    slide3.addText('Low Stock Alerts:', { x: 0.8, y: 1.4, fontSize: 16, bold: true, color: 'D90429' });
    slide3.addText(lowStockText, { x: 0.8, y: 1.9, w: 4.2, fontSize: 13, color: '333333' });

    const paymentRows: PptxGenJS.TableRow[] = [
      [
        { text: 'Method', options: { bold: true, fill: { color: '1B4332' }, color: 'FFFFFF' } },
        { text: 'Count', options: { bold: true, fill: { color: '1B4332' }, color: 'FFFFFF' } },
        { text: 'Total (₹)', options: { bold: true, fill: { color: '1B4332' }, color: 'FFFFFF' } },
      ],
      ...Object.entries(paymentBreakdown).map(([method, data]) => [
        { text: method, options: { fill: { color: 'F8F9FA' } } },
        { text: String(data.count), options: { fill: { color: 'F8F9FA' } } },
        { text: `₹${data.totalAmount.toFixed(2)}`, options: { fill: { color: 'F8F9FA' } } },
      ]),
    ];

    slide3.addTable(paymentRows, {
      x: 5.2,
      y: 1.4,
      w: 4.0,
      colW: [1.4, 1.1, 1.5],
      fontSize: 12,
    });

    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filePath = path.join(outputDir, `Sales_Analysis_Report.pptx`);
    await pptx.writeFile({ fileName: filePath });

    return filePath;
  }
}
