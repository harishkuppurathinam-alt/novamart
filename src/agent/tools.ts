import { FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { InventoryService } from '../services/inventory.service';
import { BillingService } from '../services/billing.service';
import { KhataService } from '../services/khata.service';
import { ReportingService } from '../services/reporting.service';
import { PreferenceService } from '../services/preference.service';
import { PDFService } from '../services/pdf.service';
import { PPTXService } from '../services/pptx.service';

export interface ToolExecutionContext {
  telegramId: string;
}

export const agentToolDeclarations: FunctionDeclaration[] = [
  // Inventory Tools
  {
    name: 'search_products',
    description: 'Search active supermarket products by keyword, category, or name.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'Search query string' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_stock',
    description: 'Check available stock quantity, price, and SKU for a product by name or ID.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        product_id_or_name: { type: SchemaType.STRING, description: 'Product name or ID' },
      },
      required: ['product_id_or_name'],
    },
  },
  {
    name: 'receive_stock',
    description: 'Receive new incoming stock safely into inventory. Updates stock quantity, cost price, and MRP.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        product_id_or_name: { type: SchemaType.STRING, description: 'Product name or ID' },
        quantity: { type: SchemaType.NUMBER, description: 'Quantity received' },
        cost_price: { type: SchemaType.NUMBER, description: 'Cost price per unit' },
        mrp: { type: SchemaType.NUMBER, description: 'MRP / selling price per unit' },
      },
      required: ['product_id_or_name', 'quantity'],
    },
  },
  {
    name: 'create_product',
    description: 'Create a new product in the database.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Product name' },
        selling_price: { type: SchemaType.NUMBER, description: 'Selling price' },
        category: { type: SchemaType.STRING, description: 'Category name' },
        unit: { type: SchemaType.STRING, description: 'Unit (pcs, kg, pack)' },
        cost_price: { type: SchemaType.NUMBER, description: 'Cost price' },
        mrp: { type: SchemaType.NUMBER, description: 'MRP' },
        gst_rate: { type: SchemaType.NUMBER, description: 'GST rate' },
        stock_quantity: { type: SchemaType.NUMBER, description: 'Initial stock quantity' },
      },
      required: ['name', 'selling_price'],
    },
  },
  {
    name: 'get_low_stock',
    description: 'Find products running low on stock (stock <= reorderLevel).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },

  // Billing Tools
  {
    name: 'create_draft_bill',
    description: 'Create or retrieve active DRAFT bill for user.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        customer_name: { type: SchemaType.STRING, description: 'Customer name' },
      },
    },
  },
  {
    name: 'get_draft_bill',
    description: 'Get current DRAFT bill for user.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: 'add_bill_item',
    description: 'Add product item to current DRAFT bill (does NOT reduce stock). Note: Adds quantity to any existing item in draft. Do NOT execute this during bill finalization.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        product_id_or_name: { type: SchemaType.STRING, description: 'Product name or ID' },
        quantity: { type: SchemaType.NUMBER, description: 'Quantity' },
      },
      required: ['product_id_or_name', 'quantity'],
    },
  },
  {
    name: 'update_bill_item',
    description: 'Update item quantity in current DRAFT bill.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        product_id_or_name: { type: SchemaType.STRING, description: 'Product name or ID' },
        quantity: { type: SchemaType.NUMBER, description: 'New quantity' },
      },
      required: ['product_id_or_name', 'quantity'],
    },
  },
  {
    name: 'remove_bill_item',
    description: 'Remove item from current DRAFT bill.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        product_id_or_name: { type: SchemaType.STRING, description: 'Product name or ID' },
      },
      required: ['product_id_or_name'],
    },
  },
  {
    name: 'finalize_bill',
    description: 'Finalize current DRAFT bill inside atomic transaction. Checks stock availability, deducts stock, calculates CGST/SGST, records payment method (CASH, UPI, CARD, CREDIT), and automatically generates and attaches the official GST Tax Invoice PDF file. Do NOT ask the user if they want a PDF invoice.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        payment_method: { type: SchemaType.STRING, description: 'CASH, UPI, CARD, or CREDIT' },
        customer_name: { type: SchemaType.STRING, description: 'Customer name' },
      },
    },
  },

  // Khata Tools
  {
    name: 'find_customer',
    description: 'Find customer by name.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Customer name' },
      },
      required: ['name'],
    },
  },
  {
    name: 'add_credit',
    description: 'Add credit balance to customer Khata ledger (e.g. Put 500 on Ramesh\'s khata).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        customer_name: { type: SchemaType.STRING, description: 'Customer name' },
        amount: { type: SchemaType.NUMBER, description: 'Amount in INR' },
        description: { type: SchemaType.STRING, description: 'Description' },
      },
      required: ['customer_name', 'amount'],
    },
  },
  {
    name: 'record_payment',
    description: 'Record customer payment to reduce Khata ledger balance (e.g. Ramesh paid 300).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        customer_name: { type: SchemaType.STRING, description: 'Customer name' },
        amount: { type: SchemaType.NUMBER, description: 'Payment amount received in INR' },
        description: { type: SchemaType.STRING, description: 'Description' },
      },
      required: ['customer_name', 'amount'],
    },
  },
  {
    name: 'get_credit_balance',
    description: 'Get customer credit balance.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        customer_name: { type: SchemaType.STRING, description: 'Customer name' },
      },
      required: ['customer_name'],
    },
  },
  {
    name: 'get_credit_transactions',
    description: 'Get customer transaction history.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        customer_name: { type: SchemaType.STRING, description: 'Customer name' },
      },
      required: ['customer_name'],
    },
  },

  // Preference Tools
  {
    name: 'get_preference',
    description: 'Get persistent preference value for key.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        key: { type: SchemaType.STRING, description: 'Preference key' },
      },
      required: ['key'],
    },
  },
  {
    name: 'set_preference',
    description: 'Set persistent preference key-value in database.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        key: { type: SchemaType.STRING, description: 'Preference key' },
        value: { type: SchemaType.STRING, description: 'Preference value' },
      },
      required: ['key', 'value'],
    },
  },

  // Reporting Tools
  {
    name: 'get_today_sales',
    description: 'Get today\'s sales summary, bill count, total CGST/SGST, and total sales.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: 'get_sales_report',
    description: 'Get sales report for date period.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        start_date: { type: SchemaType.STRING, description: 'YYYY-MM-DD' },
        end_date: { type: SchemaType.STRING, description: 'YYYY-MM-DD' },
      },
    },
  },
  {
    name: 'get_top_products',
    description: 'Get top selling products by quantity and revenue.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        limit: { type: SchemaType.NUMBER, description: 'Limit' },
      },
    },
  },
  {
    name: 'get_payment_breakdown',
    description: 'Get sales breakdown by payment method.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },

  // Artifact Tools
  {
    name: 'generate_invoice_pdf',
    description: 'Generate GST Tax Invoice PDF file.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        bill_id_or_number: { type: SchemaType.STRING, description: 'Bill ID or SM-XXXXX bill number' },
      },
    },
  },
  {
    name: 'generate_sales_analysis_pptx',
    description: 'Generate 3-slide Sales Analysis PowerPoint Presentation (PPTX).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        period: { type: SchemaType.STRING, description: 'Period (today, weekly)' },
      },
    },
  },
];

export async function executeAgentTool(
  name: string,
  args: any,
  context: ToolExecutionContext
): Promise<{ result?: any; error?: string; artifactPath?: string; artifactType?: 'pdf' | 'pptx' }> {
  try {
    switch (name) {
      // Inventory
      case 'search_products':
        return { result: await InventoryService.searchProducts(args.query) };
      case 'get_stock':
        return { result: await InventoryService.getStock(args.product_id_or_name) };
      case 'receive_stock':
        return {
          result: await InventoryService.receiveStock(
            args.product_id_or_name,
            Number(args.quantity),
            args.cost_price ? Number(args.cost_price) : undefined,
            args.mrp ? Number(args.mrp) : undefined
          ),
        };
      case 'create_product':
        return {
          result: await InventoryService.createProduct({
            name: args.name,
            sellingPrice: Number(args.selling_price),
            category: args.category,
            unit: args.unit,
            costPrice: args.cost_price ? Number(args.cost_price) : undefined,
            mrp: args.mrp ? Number(args.mrp) : undefined,
            gstRate: args.gst_rate ? Number(args.gst_rate) : undefined,
            stockQuantity: args.stock_quantity ? Number(args.stock_quantity) : undefined,
          }),
        };
      case 'get_low_stock':
        return { result: await InventoryService.getLowStockProducts() };

      // Billing
      case 'create_draft_bill':
        return { result: await BillingService.createDraftBill(context.telegramId, args.customer_name) };
      case 'get_draft_bill':
        return { result: await BillingService.getDraftBill(context.telegramId) };
      case 'add_bill_item':
        return {
          result: await BillingService.addBillItem(
            context.telegramId,
            args.product_id_or_name,
            Number(args.quantity)
          ),
        };
      case 'update_bill_item':
        return {
          result: await BillingService.updateBillItemQuantity(
            context.telegramId,
            args.product_id_or_name,
            Number(args.quantity)
          ),
        };
      case 'remove_bill_item':
        return {
          result: await BillingService.removeBillItem(context.telegramId, args.product_id_or_name),
        };
      case 'finalize_bill': {
        let paymentMethod = args.payment_method;
        if (!paymentMethod) {
          const pref = await PreferenceService.getPreference(context.telegramId, 'default_payment_method');
          paymentMethod = pref || 'UPI';
        }
        const bill = await BillingService.finalizeBill(
          context.telegramId,
          paymentMethod,
          args.customer_name
        );
        const pdfPath = await PDFService.generateInvoicePDF(bill.id);
        return {
          result: bill,
          artifactPath: pdfPath,
          artifactType: 'pdf',
        };
      }

      // Khata
      case 'find_customer':
        return { result: await KhataService.findCustomer(args.name) };
      case 'add_credit':
        return {
          result: await KhataService.addCredit(args.customer_name, Number(args.amount), args.description),
        };
      case 'record_payment':
        return {
          result: await KhataService.recordPayment(args.customer_name, Number(args.amount), args.description),
        };
      case 'get_credit_balance':
        return { result: await KhataService.getBalance(args.customer_name) };
      case 'get_credit_transactions':
        return { result: await KhataService.getTransactions(args.customer_name) };

      // Preferences
      case 'get_preference':
        return { result: await PreferenceService.getPreference(context.telegramId, args.key) };
      case 'set_preference':
        return {
          result: await PreferenceService.setPreference(context.telegramId, args.key, args.value),
        };

      // Reporting
      case 'get_today_sales':
        return { result: await ReportingService.getTodaySales() };
      case 'get_sales_report':
        return {
          result: await ReportingService.getSalesForPeriod(
            args.start_date || new Date().toISOString().split('T')[0],
            args.end_date || new Date().toISOString().split('T')[0]
          ),
        };
      case 'get_top_products':
        return { result: await ReportingService.getTopSellingProducts(args.limit ? Number(args.limit) : 5) };
      case 'get_payment_breakdown':
        return { result: await ReportingService.getPaymentBreakdown() };

      // Artifacts
      case 'generate_invoice_pdf': {
        let billIdOrNum = args.bill_id_or_number;
        if (!billIdOrNum) {
          const draft = await BillingService.getDraftBill(context.telegramId);
          billIdOrNum = draft.billNumber;
        }
        const pdfPath = await PDFService.generateInvoicePDF(billIdOrNum);
        return {
          result: { success: true, pdfPath },
          artifactPath: pdfPath,
          artifactType: 'pdf',
        };
      }
      case 'generate_sales_analysis_pptx': {
        const pptxPath = await PPTXService.generateSalesAnalysisPPTX(args.period || 'today');
        return {
          result: { success: true, pptxPath },
          artifactPath: pptxPath,
          artifactType: 'pptx',
        };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    return { error: err.message || String(err) };
  }
}
