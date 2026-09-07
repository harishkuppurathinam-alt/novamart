import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding NovaMart Supermarket Database...');

  // Clean tables
  await prisma.preference.deleteMany();
  await prisma.khataTransaction.deleteMany();
  await prisma.billItem.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();

  // Create default User
  const defaultUser = await prisma.user.create({
    data: {
      telegramId: 'default_user',
      username: 'storeowner',
      firstName: 'Store',
      lastName: 'Owner',
    },
  });

  // Create 20+ realistic supermarket products
  const products = [
    { name: 'Maggi 70g', description: 'Instant noodles 70g pack', sku: 'MAG-70G', category: 'Snacks', unit: 'pack', costPrice: 11, sellingPrice: 14, mrp: 14, gstRate: 12, stockQuantity: 30, reorderLevel: 10 },
    { name: 'Amul Butter 100g', description: 'Pasteurized salted butter', sku: 'AMU-BUT-100G', category: 'Dairy', unit: 'pack', costPrice: 48, sellingPrice: 58, mrp: 58, gstRate: 12, stockQuantity: 25, reorderLevel: 10 },
    { name: 'Aashirvaad Atta 5kg', description: 'Whole wheat flour 5kg', sku: 'AAS-ATT-5KG', category: 'Groceries', unit: 'pack', costPrice: 190, sellingPrice: 230, mrp: 245, gstRate: 5, stockQuantity: 15, reorderLevel: 5 },
    { name: 'Tata Salt 1kg', description: 'Iodized crystal salt', sku: 'TAT-SAL-1KG', category: 'Groceries', unit: 'pack', costPrice: 20, sellingPrice: 28, mrp: 28, gstRate: 0, stockQuantity: 50, reorderLevel: 15 },
    { name: 'Fortune Sunflower Oil 1L', description: 'Refined sunflower oil', sku: 'FOR-OIL-1L', category: 'Groceries', unit: 'bottle', costPrice: 130, sellingPrice: 155, mrp: 165, gstRate: 5, stockQuantity: 20, reorderLevel: 8 },
    { name: 'India Gate Basmati Rice 5kg', description: 'Premium basmati rice 5kg', sku: 'IND-RIC-5KG', category: 'Groceries', unit: 'pack', costPrice: 390, sellingPrice: 480, mrp: 520, gstRate: 5, stockQuantity: 12, reorderLevel: 5 },
    { name: 'Toor Dal 1kg', description: 'Unpolished split pigeon peas', sku: 'TOO-DAL-1KG', category: 'Groceries', unit: 'pack', costPrice: 120, sellingPrice: 145, mrp: 160, gstRate: 5, stockQuantity: 35, reorderLevel: 10 },
    { name: 'Sugar 1kg', description: 'Refined white sugar 1kg', sku: 'SUG-1KG', category: 'Groceries', unit: 'pack', costPrice: 36, sellingPrice: 45, mrp: 48, gstRate: 5, stockQuantity: 60, reorderLevel: 15 },
    { name: 'Parle-G 800g', description: 'Glucose biscuits mega pack', sku: 'PAR-G-800G', category: 'Snacks', unit: 'pack', costPrice: 50, sellingPrice: 65, mrp: 70, gstRate: 18, stockQuantity: 4, reorderLevel: 10 }, // INTENTIONALLY LOW STOCK
    { name: 'Britannia Bread', description: 'Fresh white sandwich bread', sku: 'BRI-BRE-400G', category: 'Bakery', unit: 'pack', costPrice: 30, sellingPrice: 40, mrp: 40, gstRate: 0, stockQuantity: 18, reorderLevel: 5 },
    { name: 'Amul Milk 1L', description: 'Full cream milk 1 litre', sku: 'AMU-MIL-1L', category: 'Dairy', unit: 'pouch', costPrice: 56, sellingPrice: 66, mrp: 66, gstRate: 5, stockQuantity: 40, reorderLevel: 10 },
    { name: 'Coca Cola 750ml', description: 'Soft drink bottle', sku: 'COC-COL-750ML', category: 'Beverages', unit: 'bottle', costPrice: 34, sellingPrice: 45, mrp: 45, gstRate: 18, stockQuantity: 30, reorderLevel: 10 },
    { name: 'Pepsi 750ml', description: 'Carbonated cola beverage', sku: 'PEP-750ML', category: 'Beverages', unit: 'bottle', costPrice: 34, sellingPrice: 45, mrp: 45, gstRate: 18, stockQuantity: 25, reorderLevel: 10 },
    { name: 'Lays Classic 50g', description: 'Salted potato chips', sku: 'LAY-CLA-50G', category: 'Snacks', unit: 'pack', costPrice: 15, sellingPrice: 20, mrp: 20, gstRate: 12, stockQuantity: 50, reorderLevel: 15 },
    { name: 'Surf Excel 1kg', description: 'Detergent powder 1kg', sku: 'SUR-EXC-1KG', category: 'Household', unit: 'pack', costPrice: 110, sellingPrice: 140, mrp: 150, gstRate: 18, stockQuantity: 15, reorderLevel: 5 },
    { name: 'Colgate 100g', description: 'Dental cream toothpaste', sku: 'COL-TP-100G', category: 'Personal Care', unit: 'pack', costPrice: 48, sellingPrice: 65, mrp: 70, gstRate: 18, stockQuantity: 30, reorderLevel: 10 },
    { name: 'Lux Soap', description: 'Beauty soap bar 100g', sku: 'LUX-SOA-100G', category: 'Personal Care', unit: 'bar', costPrice: 26, sellingPrice: 35, mrp: 38, gstRate: 18, stockQuantity: 40, reorderLevel: 10 },
    { name: 'Dettol 250ml', description: 'Antiseptic liquid 250ml', sku: 'DET-LIQ-250ML', category: 'Personal Care', unit: 'bottle', costPrice: 90, sellingPrice: 115, mrp: 125, gstRate: 18, stockQuantity: 22, reorderLevel: 5 },
    { name: 'Tata Tea 250g', description: 'Gold leaf black tea 250g', sku: 'TAT-TEA-250G', category: 'Beverages', unit: 'pack', costPrice: 100, sellingPrice: 130, mrp: 140, gstRate: 5, stockQuantity: 28, reorderLevel: 8 },
    { name: 'Kissan Tomato Ketchup', description: 'Fresh tomato ketchup 500g', sku: 'KIS-KET-500G', category: 'Groceries', unit: 'bottle', costPrice: 82, sellingPrice: 110, mrp: 120, gstRate: 12, stockQuantity: 16, reorderLevel: 5 },
  ];

  for (const prod of products) {
    await prisma.product.create({ data: prod });
  }

  // Create demo Customer (Ramesh)
  const ramesh = await prisma.customer.create({
    data: {
      name: 'Ramesh',
      phone: '9876543210',
      creditBalance: 0.0,
    },
  });

  // Create default Preference for User
  await prisma.preference.create({
    data: {
      userId: defaultUser.id,
      key: 'default_payment_method',
      value: 'UPI',
    },
  });

  console.log(`✅ Database seeded successfully with ${products.length} products, demo user, customer Ramesh, and preferences!`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
