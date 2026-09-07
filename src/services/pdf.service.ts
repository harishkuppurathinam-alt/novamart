import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { BillingService } from './billing.service';

export class PDFService {
  /**
   * Generate GST Tax Invoice PDF.
   * Includes KiranaOps Store Name, Invoice Number, Date, Customer, Item list, Subtotal, CGST, SGST, Total, Payment method.
   */
  static async generateInvoicePDF(billIdOrNumber: number | string): Promise<string> {
    const bill = await BillingService.getBill(billIdOrNumber);

    if (!bill) {
      throw new Error(`Bill ${billIdOrNumber} not found.`);
    }

    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filePath = path.join(outputDir, `Invoice_${bill.billNumber}.pdf`);
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Header
    doc
      .fontSize(22)
      .fillColor('#1b4332')
      .text('NovaMart Supermarket', { align: 'center' });

    doc
      .fontSize(10)
      .fillColor('#555555')
      .text('123 Main Bazaar Road, Market City | GSTIN: 29AAAAA0000A1Z5', { align: 'center' })
      .text('Phone: +91 98765 43210 | Email: support@novamart.com', { align: 'center' });

    doc.moveDown(1);
    doc.strokeColor('#cccccc').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(1);

    // Invoice Meta
    const metaY = doc.y;
    doc.fontSize(14).fillColor('#2d6a4f').text('TAX INVOICE', 40, metaY);

    doc.fontSize(10).fillColor('#333333');
    doc.text(`Invoice No: ${bill.billNumber}`, 40, metaY + 20);
    doc.text(`Date: ${new Date(bill.createdAt).toLocaleString()}`, 40, metaY + 34);
    doc.text(`Status: ${bill.status}`, 40, metaY + 48);

    doc.text(`Customer: ${bill.customerName || 'Walk-in Customer'}`, 340, metaY + 20);
    doc.text(`Payment Method: ${bill.paymentMethod || 'PENDING'}`, 340, metaY + 34);

    doc.moveDown(4);
    doc.strokeColor('#cccccc').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(1);

    // Items Table Header
    const tableTop = doc.y;
    doc.fontSize(10).fillColor('#1b4332');
    doc.text('Item Description', 40, tableTop, { width: 170 });
    doc.text('Qty', 210, tableTop, { width: 35, align: 'right' });
    doc.text('Unit Price', 250, tableTop, { width: 65, align: 'right' });
    doc.text('CGST', 320, tableTop, { width: 55, align: 'right' });
    doc.text('SGST', 380, tableTop, { width: 55, align: 'right' });
    doc.text('Total (Rs.)', 445, tableTop, { width: 90, align: 'right' });

    doc.moveDown(0.5);
    doc.strokeColor('#2d6a4f').lineWidth(1.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke();

    // Table Rows
    let y = doc.y + 8;
    doc.fontSize(9).fillColor('#333333');

    for (const item of bill.items) {
      doc.text(item.productNameSnapshot, 40, y, { width: 170 });
      doc.text(String(item.quantity), 210, y, { width: 35, align: 'right' });
      doc.text(`Rs. ${item.unitPrice.toFixed(2)}`, 250, y, { width: 65, align: 'right' });
      doc.text(`Rs. ${item.lineCgst.toFixed(2)}`, 320, y, { width: 55, align: 'right' });
      doc.text(`Rs. ${item.lineSgst.toFixed(2)}`, 380, y, { width: 55, align: 'right' });
      doc.text(`Rs. ${item.lineTotal.toFixed(2)}`, 445, y, { width: 90, align: 'right' });

      y += 20;
    }

    doc.strokeColor('#cccccc').lineWidth(1).moveTo(40, y).lineTo(555, y).stroke();
    y += 15;

    // Summary Totals
    doc.fontSize(10).fillColor('#333333');
    doc.text(`Subtotal: Rs. ${bill.subtotal.toFixed(2)}`, 340, y, { width: 195, align: 'right' });
    y += 16;
    doc.text(`CGST: Rs. ${bill.cgst.toFixed(2)}`, 340, y, { width: 195, align: 'right' });
    y += 16;
    doc.text(`SGST: Rs. ${bill.sgst.toFixed(2)}`, 340, y, { width: 195, align: 'right' });
    y += 18;

    doc.fontSize(12).fillColor('#1b4332');
    doc.text(`Grand Total: Rs. ${bill.total.toFixed(2)}`, 340, y, { width: 195, align: 'right' });

    y += 35;
    doc.fontSize(9).fillColor('#777777').text('Thank you for shopping at NovaMart Supermarket!', 40, y, { align: 'center' });

    doc.end();

    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => resolve(filePath));
      writeStream.on('error', reject);
    });
  }
}
