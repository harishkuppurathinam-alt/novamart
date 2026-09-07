import assert from 'assert';
import { prisma } from '../src/db/prisma';
import { InventoryService } from '../src/services/inventory.service';
import { BillingService } from '../src/services/billing.service';
import { KhataService } from '../src/services/khata.service';
import { PreferenceService } from '../src/services/preference.service';
import { ReportingService } from '../src/services/reporting.service';

async function runUnitTests() {
  console.log('🧪 Running NovaMart Business Services Test Suite...\n');

  const testUser = 'test_telegram_user_123';

  // Cleanup test user bills & preferences
  const existingUser = await prisma.user.findUnique({ where: { telegramId: testUser } });
  if (existingUser) {
    await prisma.billItem.deleteMany({ where: { bill: { userId: existingUser.id } } });
    await prisma.bill.deleteMany({ where: { userId: existingUser.id } });
    await prisma.preference.deleteMany({ where: { userId: existingUser.id } });
  }

  // 1. Product Search Test
  console.log('Test 1: Product Search');
  const searchResults = await InventoryService.searchProducts('Maggi');
  assert(searchResults.length > 0, 'Should find Maggi product');
  assert(searchResults[0].name.includes('Maggi'), 'Matching product name should contain Maggi');
  console.log('  ✅ PASSED');

  // 2. Receive Stock Test
  console.log('Test 2: Receive Stock');
  const maggiBefore = await InventoryService.getStock('Maggi');
  const stockRes = await InventoryService.receiveStock('Maggi', 20, 11, 14);
  assert.strictEqual(stockRes.currentStock, maggiBefore.stockQuantity + 20, 'Stock quantity should increase by 20');
  console.log('  ✅ PASSED');

  // 3. Add Bill Item Test
  console.log('Test 3: Add Bill Item');
  const draft1 = await BillingService.addBillItem(testUser, 'Maggi', 4);
  assert.strictEqual(draft1.items.length, 1, 'Draft should have 1 item');
  assert.strictEqual(draft1.items[0].quantity, 4, 'Maggi quantity should be 4');
  console.log('  ✅ PASSED');

  // 4. Update Bill Item Test
  console.log('Test 4: Update Bill Item Quantity');
  const draft2 = await BillingService.updateBillItemQuantity(testUser, 'Maggi', 6);
  assert.strictEqual(draft2.items[0].quantity, 6, 'Maggi quantity should be updated to 6');
  console.log('  ✅ PASSED');

  // 5. Remove Bill Item Test
  console.log('Test 5: Remove Bill Item');
  await BillingService.addBillItem(testUser, 'Sugar', 2);
  const draftWithSugar = await BillingService.getDraftBill(testUser);
  assert.strictEqual(draftWithSugar.items.length, 2, 'Draft should have 2 items before removal');
  const draftRemoved = await BillingService.removeBillItem(testUser, 'Sugar');
  assert.strictEqual(draftRemoved.items.length, 1, 'Draft should have 1 item after Sugar removal');
  console.log('  ✅ PASSED');

  // 6. GST Calculation Test (CGST = GST/2, SGST = GST/2)
  console.log('Test 6: GST Calculation');
  const calcBill = await BillingService.calculateBill(draftRemoved.id);
  const maggiProd = await InventoryService.getStock('Maggi');
  const expectedSubtotal = 6 * maggiProd.sellingPrice; // 6 * 14 = 84
  const expectedGst = (expectedSubtotal * maggiProd.gstRate) / 100; // 84 * 12% = 10.08
  const expectedCgst = expectedGst / 2; // 5.04
  const expectedSgst = expectedGst / 2; // 5.04
  assert.strictEqual(calcBill.subtotal, expectedSubtotal, `Subtotal should be ${expectedSubtotal}`);
  assert.strictEqual(calcBill.cgst, expectedCgst, `CGST should be ${expectedCgst}`);
  assert.strictEqual(calcBill.sgst, expectedSgst, `SGST should be ${expectedSgst}`);
  console.log('  ✅ PASSED');

  // 7. Successful Bill Finalization Test
  console.log('Test 7: Successful Bill Finalization');
  const stockBeforeFinal = (await InventoryService.getStock('Maggi')).stockQuantity;
  const finalizedBill = await BillingService.finalizeBill(testUser, 'UPI', 'Test Customer');
  assert.strictEqual(finalizedBill.status, 'FINALIZED', 'Status should be FINALIZED');
  const stockAfterFinal = (await InventoryService.getStock('Maggi')).stockQuantity;
  assert.strictEqual(stockAfterFinal, stockBeforeFinal - 6, 'Maggi stock should decrease by 6');
  console.log('  ✅ PASSED');

  // 8. Oversell Rejection Test
  console.log('Test 8: Oversell Rejection');
  const maggiStockAvailable = (await InventoryService.getStock('Maggi')).stockQuantity;
  await BillingService.addBillItem(testUser, 'Maggi', maggiStockAvailable + 100);
  try {
    await BillingService.finalizeBill(testUser, 'UPI');
    assert.fail('Should have thrown insufficient stock error');
  } catch (err: any) {
    assert(err.message.includes('Insufficient stock'), 'Error message should indicate insufficient stock');
  }
  console.log('  ✅ PASSED');

  // 9. Atomic Rollback Test (Failed finalization must NOT alter stock)
  console.log('Test 9: Atomic Rollback on Failed Finalization');
  const stockAfterFailedFinal = (await InventoryService.getStock('Maggi')).stockQuantity;
  assert.strictEqual(stockAfterFailedFinal, maggiStockAvailable, 'Stock must remain unchanged after failed finalization');
  console.log('  ✅ PASSED');

  // Clear oversold item from draft
  await BillingService.removeBillItem(testUser, 'Maggi');

  // 10. Duplicate Finalization Idempotency Test
  console.log('Test 10: Duplicate Finalization Idempotency');
  // Add item, finalize, then finalize again
  await BillingService.addBillItem(testUser, 'Maggi', 2);
  const firstFinal = await BillingService.finalizeBill(testUser, 'UPI');
  assert.strictEqual(firstFinal.status, 'FINALIZED');
  const stockBeforeDup = (await InventoryService.getStock('Maggi')).stockQuantity;
  // Calling finalizeBill again on the finalized bill returns existing finalized bill without deducting stock again
  const dupResult = await BillingService.finalizeBill(testUser, 'UPI');
  const stockAfterDup = (await InventoryService.getStock('Maggi')).stockQuantity;
  assert.strictEqual(stockAfterDup, stockBeforeDup, 'Stock must not be deducted again on duplicate finalization request');
  assert.strictEqual(dupResult.id, firstFinal.id, 'Duplicate finalization should return same bill');
  console.log('  ✅ PASSED');

  // 11. Khata Credit Test
  console.log('Test 11: Khata Credit');
  const khataRes1 = await KhataService.addCredit('Ramesh', 500, 'Test credit');
  assert(khataRes1.currentBalance >= 500, 'Khata balance should increase by 500');
  console.log('  ✅ PASSED');

  // 12. Khata Payment Test
  console.log('Test 12: Khata Payment');
  const khataRes2 = await KhataService.recordPayment('Ramesh', 300, 'Test payment');
  assert.strictEqual(khataRes2.remainingBalance, khataRes1.currentBalance - 300, 'Khata balance should decrease by 300');
  console.log('  ✅ PASSED');

  // 13. Preference Persistence Test
  console.log('Test 13: Preference Persistence');
  await PreferenceService.setPreference(testUser, 'default_payment_method', 'UPI');
  const savedPref = await PreferenceService.getPreference(testUser, 'default_payment_method');
  assert.strictEqual(savedPref, 'UPI', 'Saved preference should be UPI');
  console.log('  ✅ PASSED');

  // 14. Sales Calculation Test
  console.log('Test 14: Sales Calculation');
  const todayReport = await ReportingService.getTodaySales();
  assert(todayReport.totalSales > 0, 'Total sales should be greater than 0');
  assert(todayReport.totalBills >= 1, 'Total bills should be at least 1');
  console.log('  ✅ PASSED');

  console.log('\n🎉 ALL 14 BUSINESS SERVICES TESTS PASSED SUCCESSFULLY!');
}

runUnitTests()
  .catch((err) => {
    console.error('❌ Test Execution Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
