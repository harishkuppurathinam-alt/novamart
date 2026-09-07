import prisma from '../db/prisma';
import { InventoryService } from './inventory.service';
import { UserService } from './user.service';

export class BillingService {
  /**
   * Create or retrieve active DRAFT bill for a Telegram user.
   */
  static async createDraftBill(telegramId: string, customerName?: string) {
    const user = await UserService.findOrCreateUser(telegramId);

    let draftBill = await prisma.bill.findFirst({
      where: {
        userId: user.id,
        status: 'DRAFT',
      },
      include: {
        items: { include: { product: true } },
      },
    });

    if (!draftBill) {
      const lastBill = await prisma.bill.findFirst({
        orderBy: { id: 'desc' },
      });
      const nextId = (lastBill?.id || 0) + 1;
      const billNumber = `SM-${10000 + nextId}`;

      draftBill = await prisma.bill.create({
        data: {
          billNumber,
          userId: user.id,
          customerName: customerName || 'Walk-in Customer',
          status: 'DRAFT',
        },
        include: {
          items: { include: { product: true } },
        },
      });
    } else if (customerName && draftBill.customerName !== customerName) {
      draftBill = await prisma.bill.update({
        where: { id: draftBill.id },
        data: { customerName },
        include: { items: { include: { product: true } } },
      });
    }

    return draftBill;
  }

  /**
   * Get current active DRAFT bill for user.
   */
  static async getDraftBill(telegramId: string) {
    return this.createDraftBill(telegramId);
  }

  /**
   * Add item to DRAFT bill. Stock is NOT reduced during DRAFT operations.
   */
  static async addBillItem(telegramId: string, productIdOrName: string | number, quantity: number) {
    if (quantity <= 0) {
      throw new Error('Quantity must be at least 1.');
    }

    const product = await InventoryService.getStock(productIdOrName);
    const draftBill = await this.getDraftBill(telegramId);

    const existingItem = await prisma.billItem.findUnique({
      where: {
        billId_productId: {
          billId: draftBill.id,
          productId: product.id,
        },
      },
    });

    const newQuantity = (existingItem?.quantity ?? 0) + quantity;

    if (existingItem) {
      await prisma.billItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
      });
    } else {
      await prisma.billItem.create({
        data: {
          billId: draftBill.id,
          productId: product.id,
          productNameSnapshot: product.name,
          quantity: newQuantity,
          unitPrice: product.sellingPrice,
          gstRate: product.gstRate,
        },
      });
    }

    return this.calculateBill(draftBill.id);
  }

  /**
   * Remove item from DRAFT bill. Stock is NOT modified.
   */
  static async removeBillItem(telegramId: string, productIdOrName: string | number) {
    const product = await InventoryService.getStock(productIdOrName);
    const draftBill = await this.getDraftBill(telegramId);

    const item = await prisma.billItem.findUnique({
      where: {
        billId_productId: {
          billId: draftBill.id,
          productId: product.id,
        },
      },
    });

    if (!item) {
      throw new Error(`Product "${product.name}" is not in your draft bill.`);
    }

    await prisma.billItem.delete({
      where: { id: item.id },
    });

    return this.calculateBill(draftBill.id);
  }

  /**
   * Update item quantity in DRAFT bill.
   */
  static async updateBillItemQuantity(
    telegramId: string,
    productIdOrName: string | number,
    quantity: number
  ) {
    if (quantity <= 0) {
      return this.removeBillItem(telegramId, productIdOrName);
    }

    const product = await InventoryService.getStock(productIdOrName);
    const draftBill = await this.getDraftBill(telegramId);

    const existingItem = await prisma.billItem.findUnique({
      where: {
        billId_productId: {
          billId: draftBill.id,
          productId: product.id,
        },
      },
    });

    if (!existingItem) {
      return this.addBillItem(telegramId, productIdOrName, quantity);
    }

    await prisma.billItem.update({
      where: { id: existingItem.id },
      data: { quantity },
    });

    return this.calculateBill(draftBill.id);
  }

  /**
   * Deterministic GST and Bill Calculation.
   * GST is split equally into CGST (GST/2) and SGST (GST/2).
   */
  static async calculateBill(billId: number) {
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: { items: { include: { product: true } } },
    });

    if (!bill) throw new Error('Bill not found');

    let subtotal = 0;
    let cgst = 0;
    let sgst = 0;

    for (const item of bill.items) {
      const lineSubtotal = item.quantity * item.unitPrice;
      const totalGstRate = item.gstRate;
      const lineGst = (lineSubtotal * totalGstRate) / 100;
      const lineCgst = lineGst / 2;
      const lineSgst = lineGst / 2;
      const lineTotal = lineSubtotal + lineGst;

      await prisma.billItem.update({
        where: { id: item.id },
        data: {
          lineSubtotal: Math.round(lineSubtotal * 100) / 100,
          lineCgst: Math.round(lineCgst * 100) / 100,
          lineSgst: Math.round(lineSgst * 100) / 100,
          lineTotal: Math.round(lineTotal * 100) / 100,
        },
      });

      subtotal += lineSubtotal;
      cgst += lineCgst;
      sgst += lineSgst;
    }

    const total = subtotal + cgst + sgst;

    return prisma.bill.update({
      where: { id: billId },
      data: {
        subtotal: Math.round(subtotal * 100) / 100,
        cgst: Math.round(cgst * 100) / 100,
        sgst: Math.round(sgst * 100) / 100,
        total: Math.round(total * 100) / 100,
      },
      include: { items: { include: { product: true } } },
    });
  }

  /**
   * Finalize DRAFT bill inside an atomic Prisma Transaction.
   * Idempotent: Repeated finalization returns existing finalized bill without re-deducting stock.
   */
  static async finalizeBill(
    telegramId: string,
    paymentMethod: string = 'UPI',
    customerName?: string
  ) {
    const normPayment = paymentMethod.toUpperCase();
    const validMethods = ['CASH', 'UPI', 'CARD', 'CREDIT', 'KHATA'];
    if (!validMethods.includes(normPayment)) {
      throw new Error(`Invalid payment method: ${paymentMethod}. Supported: CASH, UPI, CARD, CREDIT.`);
    }

    const user = await UserService.findOrCreateUser(telegramId);

    // Fetch active draft or latest finalized bill for user (idempotency support)
    let draftBill = await prisma.bill.findFirst({
      where: { userId: user.id, status: 'DRAFT' },
      include: { items: { include: { product: true } } },
    });

    if (!draftBill || !draftBill.items || draftBill.items.length === 0) {
      const latestFinalized = await prisma.bill.findFirst({
        where: { userId: user.id, status: 'FINALIZED' },
        orderBy: { finalizedAt: 'desc' },
        include: { items: { include: { product: true } } },
      });

      if (latestFinalized) {
        return latestFinalized;
      }

      throw new Error('Cannot finalize an empty draft bill. Add items first.');
    }

    // Atomic Prisma Transaction
    return prisma.$transaction(async (tx) => {
      // 1. Fetch current product data and verify stock for all items
      for (const item of draftBill.items) {
        const prod = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (!prod || !prod.active) {
          throw new Error(`Product "${item.productNameSnapshot}" is no longer available.`);
        }

        if (prod.stockQuantity < item.quantity) {
          throw new Error(
            `Insufficient stock for ${prod.name}. Available: ${prod.stockQuantity}, required: ${item.quantity}.`
          );
        }
      }

      // 2. Decrease product stock
      for (const item of draftBill.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: { decrement: item.quantity },
          },
        });
      }

      // 3. Handle CREDIT / KHATA ledger balance addition if payment method is CREDIT
      const finalCustomerName = customerName || draftBill.customerName || 'Walk-in Customer';
      if (normPayment === 'CREDIT' || normPayment === 'KHATA') {
        const customer = await tx.customer.findFirst({
          where: { name: { contains: finalCustomerName } },
        });

        const targetCust =
          customer ||
          (await tx.customer.create({
            data: { name: finalCustomerName, creditBalance: 0.0 },
          }));

        const newBalance = targetCust.creditBalance + draftBill.total;
        await tx.customer.update({
          where: { id: targetCust.id },
          data: { creditBalance: newBalance },
        });

        await tx.khataTransaction.create({
          data: {
            customerId: targetCust.id,
            type: 'CREDIT',
            amount: draftBill.total,
            description: `Bill #${draftBill.billNumber} credit`,
          },
        });
      }

      // 4. Mark bill as FINALIZED
      const finalized = await tx.bill.update({
        where: { id: draftBill.id },
        data: {
          status: 'FINALIZED',
          paymentMethod: normPayment === 'KHATA' ? 'CREDIT' : normPayment,
          customerName: finalCustomerName,
          finalizedAt: new Date(),
        },
        include: {
          items: { include: { product: true } },
        },
      });

      return finalized;
    });
  }

  /**
   * Get bill by bill number or ID.
   */
  static async getBill(identifier: string | number) {
    if (typeof identifier === 'number' || !isNaN(Number(identifier))) {
      return prisma.bill.findUnique({
        where: { id: Number(identifier) },
        include: { items: { include: { product: true } } },
      });
    }

    return prisma.bill.findUnique({
      where: { billNumber: String(identifier) },
      include: { items: { include: { product: true } } },
    });
  }
}
