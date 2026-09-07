import prisma from '../db/prisma';

export class KhataService {
  /**
   * Find customer by name.
   */
  static async findCustomer(name: string) {
    return prisma.customer.findFirst({
      where: { name: { contains: name.trim() } },
    });
  }

  /**
   * Create a new customer record.
   */
  static async createCustomer(name: string, phone?: string) {
    const existing = await prisma.customer.findFirst({
      where: { name: name.trim() },
    });
    if (existing) return existing;

    return prisma.customer.create({
      data: {
        name: name.trim(),
        phone: phone || null,
        creditBalance: 0.0,
      },
    });
  }

  /**
   * Add credit to customer balance (increases creditBalance owed).
   */
  static async addCredit(customerIdOrName: number | string, amount: number, description?: string) {
    if (amount <= 0) {
      throw new Error('Credit amount must be greater than 0.');
    }

    let customer;
    if (typeof customerIdOrName === 'number') {
      customer = await prisma.customer.findUnique({ where: { id: customerIdOrName } });
    } else {
      customer = await this.findCustomer(customerIdOrName);
      if (!customer) {
        customer = await this.createCustomer(customerIdOrName);
      }
    }

    if (!customer) throw new Error('Customer not found.');

    const newBalance = customer.creditBalance + amount;

    const [updatedCustomer, transaction] = await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: { creditBalance: newBalance },
      }),
      prisma.khataTransaction.create({
        data: {
          customerId: customer.id,
          type: 'CREDIT',
          amount,
          description: description || 'Credit added',
        },
      }),
    ]);

    return {
      customer: updatedCustomer,
      transaction,
      addedAmount: amount,
      currentBalance: updatedCustomer.creditBalance,
    };
  }

  /**
   * Record payment received from customer (decreases creditBalance owed).
   */
  static async recordPayment(customerIdOrName: number | string, amount: number, description?: string) {
    if (amount <= 0) {
      throw new Error('Payment amount must be greater than 0.');
    }

    let customer;
    if (typeof customerIdOrName === 'number') {
      customer = await prisma.customer.findUnique({ where: { id: customerIdOrName } });
    } else {
      customer = await this.findCustomer(customerIdOrName);
    }

    if (!customer) throw new Error(`Customer "${customerIdOrName}" not found.`);

    const newBalance = customer.creditBalance - amount;

    const [updatedCustomer, transaction] = await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: { creditBalance: newBalance },
      }),
      prisma.khataTransaction.create({
        data: {
          customerId: customer.id,
          type: 'PAYMENT',
          amount,
          description: description || 'Payment received',
        },
      }),
    ]);

    return {
      customer: updatedCustomer,
      transaction,
      paidAmount: amount,
      remainingBalance: updatedCustomer.creditBalance,
    };
  }

  /**
   * Get customer credit balance.
   */
  static async getBalance(customerIdOrName: number | string) {
    let customer;
    if (typeof customerIdOrName === 'number') {
      customer = await prisma.customer.findUnique({ where: { id: customerIdOrName } });
    } else {
      customer = await this.findCustomer(customerIdOrName);
    }

    if (!customer) throw new Error(`Customer "${customerIdOrName}" not found.`);

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      creditBalance: customer.creditBalance,
    };
  }

  /**
   * Get transaction history for customer.
   */
  static async getTransactions(customerIdOrName: number | string) {
    let customer;
    if (typeof customerIdOrName === 'number') {
      customer = await prisma.customer.findUnique({ where: { id: customerIdOrName } });
    } else {
      customer = await this.findCustomer(customerIdOrName);
    }

    if (!customer) throw new Error(`Customer "${customerIdOrName}" not found.`);

    return prisma.khataTransaction.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}
