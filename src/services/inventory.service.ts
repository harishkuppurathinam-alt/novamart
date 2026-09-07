import prisma from '../db/prisma';

export class InventoryService {
  /**
   * Search active products by query term in name, description, category, or SKU.
   */
  static async searchProducts(query: string) {
    const term = query.trim();
    return prisma.product.findMany({
      where: {
        active: true,
        OR: [
          { name: { contains: term } },
          { description: { contains: term } },
          { category: { contains: term } },
          { sku: { contains: term } },
        ],
      },
    });
  }

  /**
   * Get single product by ID.
   */
  static async getProduct(productId: number) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new Error(`Product ID ${productId} not found.`);
    return product;
  }

  /**
   * Get product stock details by ID or fuzzy name.
   */
  static async getStock(productIdOrName: string | number) {
    let product;

    if (typeof productIdOrName === 'number' || !isNaN(Number(productIdOrName))) {
      product = await prisma.product.findUnique({
        where: { id: Number(productIdOrName) },
      });
    }

    if (!product && typeof productIdOrName === 'string') {
      product = await prisma.product.findFirst({
        where: {
          name: { contains: productIdOrName.trim() },
          active: true,
        },
      });
    }

    if (!product) {
      throw new Error(`Product "${productIdOrName}" not found in inventory.`);
    }

    return product;
  }

  /**
   * Receive stock safely into inventory. Updates stock, costPrice, sellingPrice, and MRP.
   */
  static async receiveStock(
    productIdOrName: string | number,
    quantity: number,
    costPrice?: number,
    mrp?: number
  ) {
    if (quantity <= 0) {
      throw new Error('Received quantity must be greater than 0.');
    }

    let product;
    try {
      product = await this.getStock(productIdOrName);
    } catch {
      // If product not found by name, create it!
      const name = String(productIdOrName).trim();
      const sku = `SKU-${name.toUpperCase().replace(/\s+/g, '_')}-${Date.now().toString().slice(-4)}`;
      product = await prisma.product.create({
        data: {
          name,
          sku,
          category: 'Groceries',
          unit: 'pack',
          costPrice: costPrice ?? 0,
          sellingPrice: mrp ?? (costPrice ? costPrice * 1.2 : 0),
          mrp: mrp ?? (costPrice ? costPrice * 1.2 : 0),
          gstRate: 5.0,
          stockQuantity: 0,
        },
      });
    }

    const previousStock = product.stockQuantity;
    const newStock = previousStock + quantity;

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: {
        stockQuantity: newStock,
        ...(costPrice !== undefined ? { costPrice } : {}),
        ...(mrp !== undefined ? { mrp, sellingPrice: mrp } : {}),
      },
    });

    return {
      product: updated,
      addedQuantity: quantity,
      previousStock,
      currentStock: updated.stockQuantity,
    };
  }

  /**
   * Create a new product.
   */
  static async createProduct(data: {
    name: string;
    category?: string;
    unit?: string;
    costPrice?: number;
    sellingPrice: number;
    mrp?: number;
    gstRate?: number;
    stockQuantity?: number;
    reorderLevel?: number;
  }) {
    const sku = `SKU-${data.name.toUpperCase().replace(/\s+/g, '_')}-${Date.now().toString().slice(-4)}`;
    return prisma.product.create({
      data: {
        name: data.name.trim(),
        sku,
        category: data.category || 'Groceries',
        unit: data.unit || 'pcs',
        costPrice: data.costPrice ?? 0,
        sellingPrice: data.sellingPrice,
        mrp: data.mrp ?? data.sellingPrice,
        gstRate: data.gstRate ?? 5.0,
        stockQuantity: data.stockQuantity ?? 0,
        reorderLevel: data.reorderLevel ?? 10,
      },
    });
  }

  /**
   * Get all products where stockQuantity <= reorderLevel.
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
