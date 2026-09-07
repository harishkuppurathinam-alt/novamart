import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { agentToolDeclarations, executeAgentTool, ToolExecutionContext } from './tools';
import { PreferenceService } from '../services/preference.service';

export interface AgentResponse {
  text: string;
  artifacts?: Array<{ path: string; type: 'pdf' | 'pptx' }>;
}

export class NovaMartAgent {
  private genAI: GoogleGenerativeAI | null = null;
  // Models configured with automatic quota fallback to prevent 429 errors
  private candidateModels = [
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
  ];

  constructor() {
    if (config.geminiApiKey) {
      this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
    }
  }

  /**
   * Main entrypoint for processing natural language user messages using Gemini API.
   */
  public async processMessage(userMessage: string, telegramId: string): Promise<AgentResponse> {
    const text = userMessage.trim();
    const context: ToolExecutionContext = { telegramId };
    const artifacts: Array<{ path: string; type: 'pdf' | 'pptx' }> = [];

    // Retrieve stored user preferences to ground Gemini context
    const userPrefs = await PreferenceService.getAllPreferences(telegramId);

    // If GEMINI_API_KEY is configured in .env, process via Google Gemini Generative AI Model
    if (this.genAI) {
      for (const modelName of this.candidateModels) {
        try {
          const model = this.genAI.getGenerativeModel({
            model: modelName,
            tools: [{ functionDeclarations: agentToolDeclarations }],
          });

          const systemPrompt = `You are NovaMart, an intelligent AI assistant for supermarket and store owners.
Understand any natural-language input and choose the best tools to manage store operations.

CRITICAL INSTRUCTIONS:
- Never invent products, prices, stock quantities, GST values, customer balances, sales or other business data.
- Always execute available tools to read or mutate real business data.
- Business rules are enforced by application services and database transactions. Respect tool error messages.
- AUTOMATIC PRODUCT SUBSTITUTION RULE: When a user requests a product size/variant not found in inventory (e.g. user asks for 2 Tata Tea 500g, total 1000g, but only Tata Tea 250g exists in inventory), DO NOT ask the user for confirmation or input. AUTOMATICALLY select the best matching existing product from inventory (e.g. Tata Tea 250g), calculate the equivalent quantity (e.g. 4 packs of 250g = 1000g), and IMMEDIATELY execute add_bill_item to add it directly to the draft bill. Inform the user in the draft bill response that the equivalent quantity of the available inventory size was automatically added.
- Bills are DRAFT until explicitly finalized. Stock is deducted ONLY during bill finalization.
- TELEGRAM FORMATTING RULE: Format all output responses cleanly using Telegram HTML tags (<b>bold</b>, <i>italic</i>, <code>code</code>). DO NOT use markdown tables (| col | col |) as Telegram does not render tables. Format lists, bills, and reports using clean bullet points (•) and bold headers. Keep responses concise, clear, and professional.
- FINALIZING DRAFT BILL RULE: When the user provides a payment method (e.g., "cash", "upi", "card", "credit"), the draft bill ALREADY contains the items added in prior steps. You MUST ONLY execute finalize_bill with the specified payment method. DO NOT re-call add_bill_item or update_bill_item for items already present in the draft bill.
- DRAFT ITEM QUANTITY RULE: If a user specifies an item quantity (e.g. "colgate 2 packs", "make colgate 2", "change colgate to 2"), check if the item is already present in the draft bill. If the item ALREADY exists in the active draft bill, call update_bill_item to set the exact quantity to the requested amount (e.g. 2). DO NOT call add_bill_item on an item already in the draft bill unless the user explicitly asks to add extra quantity (e.g. "add 2 more colgate").
- Never claim an operation succeeded unless the corresponding tool returns a positive result.
- Use stored preferences when appropriate. User Stored Preferences: ${JSON.stringify(userPrefs)}
- Ask a concise clarification question ONLY if required information is missing and no matching product exists.
- When generating reports, summarize tool outputs clearly and professionally with helpful formatting.`;

          const contents: any[] = [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\nUser Message: ${text}` }],
            },
          ];

          let result = await model.generateContent({ contents });

          // Loop while Gemini requests function call executions
          let maxToolLoops = 5;

          while (
            maxToolLoops > 0 &&
            result.response.functionCalls() &&
            result.response.functionCalls()!.length > 0
          ) {
            maxToolLoops--;
            const functionCalls = result.response.functionCalls()!;

            // Push model's tool call candidate response to history
            contents.push(result.response.candidates![0].content);

            const fnParts: any[] = [];
            for (const call of functionCalls) {
              console.log(`🤖 [Gemini Tool Executing (${modelName})]: ${call.name}(${JSON.stringify(call.args)})`);
              const toolRes = await executeAgentTool(call.name, call.args, context);

              if (toolRes.artifactPath && toolRes.artifactType) {
                artifacts.push({ path: toolRes.artifactPath, type: toolRes.artifactType });
              }

              fnParts.push({
                functionResponse: {
                  name: call.name,
                  response: toolRes.error
                    ? { error: toolRes.error }
                    : { output: toolRes.result },
                },
              });
            }

            // Push function response parts with role 'user'
            contents.push({
              role: 'user',
              parts: fnParts,
            });

            result = await model.generateContent({ contents });
          }

          const responseText = result.response.text();
          return {
            text: responseText,
            artifacts: artifacts.length > 0 ? artifacts : undefined,
          };
        } catch (err: any) {
          console.warn(`⚠️ Model ${modelName} Quota/Fetch Notice: ${err.message || err}`);
          // If rate limit 429 or error occurs, try next candidate model automatically
        }
      }
    }

    // Fallback Tool Execution Engine when GEMINI_API_KEY is not set or network fails
    return this.fallbackToolAgent(text, context, userPrefs);
  }

  /**
   * Deterministic Natural Language Tool Agent for local development / testing.
   */
  private async fallbackToolAgent(
    text: string,
    context: ToolExecutionContext,
    userPrefs: Record<string, string>
  ): Promise<AgentResponse> {
    const lower = text.toLowerCase();

    // 1. Receive Stock
    const receiveMatch = text.match(
      /(\d+)\s*(?:packets|pkts|pcs|units|kg)?\s*of\s+([a-zA-Z0-9\s']+)\s*came\s*in,?\s*cost\s*(\d+(?:\.\d+)?)\s*(?:each)?\s*and\s*mrp\s*is\s*(\d+(?:\.\d+)?)/i
    );
    if (receiveMatch) {
      const qty = parseInt(receiveMatch[1], 10);
      const name = receiveMatch[2].trim();
      const cost = parseFloat(receiveMatch[3]);
      const mrp = parseFloat(receiveMatch[4]);

      const res = await executeAgentTool('receive_stock', { product_id_or_name: name, quantity: qty, cost_price: cost, mrp }, context);
      if (res.error) return { text: `❌ Error: ${res.error}` };

      const p = res.result.product;
      return {
        text: `📦 Stock updated.\n\n${p.name}\nPrevious stock: ${res.result.previousStock}\nReceived: +${res.result.addedQuantity}\nCurrent stock: ${p.stockQuantity}`,
      };
    }

    // 2. Stock Check
    if (lower.includes('how much') || lower.includes('stock of') || lower.includes('is left') || lower.includes('check stock') || lower.includes('is maggie available') || lower.includes('is maggi available')) {
      const match = text.match(/(?:how much|stock of|is left|check stock|is available|available)\s+([a-zA-Z0-9\s']+?)(?:\s+is|\s+left|\?|$)/i);
      const productName = match ? match[1].trim() : text.replace(/how much|is left|available|\?/gi, '').trim();

      const res = await executeAgentTool('get_stock', { product_id_or_name: productName.length > 0 ? productName : 'Maggi' }, context);
      if (res.error) return { text: `❌ Error: ${res.error}` };

      const prod = res.result;
      return {
        text: `📊 Stock Status:\n\n${prod.name}\nAvailable Stock: ${prod.stockQuantity} ${prod.unit}\nSelling Price: ₹${prod.sellingPrice}\nMRP: ₹${prod.mrp}`,
      };
    }

    // 3. Low Stock Alert
    if (lower.includes('low stock') || lower.includes('running low')) {
      const res = await executeAgentTool('get_low_stock', {}, context);
      if (res.error) return { text: `❌ Error: ${res.error}` };

      const items = res.result;
      if (items.length === 0) return { text: '✅ All products have healthy stock levels.' };

      const listStr = items.map((i: any) => `• ${i.name}: ${i.stockQuantity} ${i.unit} left (Reorder: ${i.reorderLevel})`).join('\n');
      return { text: `⚠️ Low Stock Alert:\n\n${listStr}` };
    }

    // 4. Create Draft Bill
    if (lower.startsWith('make a bill') || lower.startsWith('create bill')) {
      const itemPairs = Array.from(text.matchAll(/(\d+)\s+([a-zA-Z0-9\s']+?)(?=\s+and|\s*,|\s*$)/gi));

      if (itemPairs.length > 0) {
        for (const m of itemPairs) {
          const qty = parseInt(m[1], 10);
          const pName = m[2].trim();
          await executeAgentTool('add_bill_item', { product_id_or_name: pName, quantity: qty }, context);
        }

        const draftRes = await executeAgentTool('get_draft_bill', {}, context);
        const bill = draftRes.result;

        const itemsStr = bill.items
          .map((i: any) => `${i.productNameSnapshot} × ${i.quantity}       ₹${i.lineTotal.toFixed(2)}`)
          .join('\n');

        return {
          text: `🧾 Draft Bill #${bill.billNumber}\n\n${itemsStr}\n\nSubtotal: ₹${bill.subtotal}\nCGST: ₹${bill.cgst}\nSGST: ₹${bill.sgst}\nTotal: ₹${bill.total}\n\nStatus: DRAFT\n\nSay 'finalize with UPI' to complete the sale.`,
        };
      }
    }

    // 5. Modify Draft Bill
    if (lower.includes('remove ') || lower.includes('change ') || (lower.includes('make ') && lower.includes(' '))) {
      let modifiedText = '';

      const removeMatch = text.match(/remove\s+([a-zA-Z0-9\s']+?)(?=\s+and|\s*$)/i);
      if (removeMatch) {
        const itemToRemove = removeMatch[1].trim();
        await executeAgentTool('remove_bill_item', { product_id_or_name: itemToRemove }, context);
        modifiedText += `Removed ${itemToRemove}. `;
      }

      const updateMatch = text.match(/(?:change|make)\s+([a-zA-Z0-9\s']+?)\s+(?:to\s+)?(\d+)/i);
      if (updateMatch) {
        const itemToUpdate = updateMatch[1].trim();
        const newQty = parseInt(updateMatch[2], 10);
        await executeAgentTool('update_bill_item', { product_id_or_name: itemToUpdate, quantity: newQty }, context);
        modifiedText += `Updated ${itemToUpdate} to ${newQty}. `;
      }

      if (modifiedText) {
        const draftRes = await executeAgentTool('get_draft_bill', {}, context);
        const bill = draftRes.result;

        const itemsStr = bill.items
          .map((i: any) => `${i.productNameSnapshot} × ${i.quantity}       ₹${i.lineTotal.toFixed(2)}`)
          .join('\n');

        return {
          text: `✏️ ${modifiedText}\n\n🧾 Draft Bill #${bill.billNumber}\n\n${itemsStr}\n\nSubtotal: ₹${bill.subtotal}\nCGST: ₹${bill.cgst}\nSGST: ₹${bill.sgst}\nTotal: ₹${bill.total}\n\nStatus: DRAFT`,
        };
      }
    }

    // 6. Finalize Bill
    if (lower.includes('finalize') || lower === 'cash' || lower === 'upi' || lower === 'card' || lower === 'credit' || lower === 'khata' || lower.startsWith('pay with') || lower.startsWith('by ')) {
      let method = 'UPI';
      if (lower.includes('cash')) method = 'CASH';
      else if (lower.includes('card')) method = 'CARD';
      else if (lower.includes('credit') || lower.includes('khata')) method = 'CREDIT';
      else if (userPrefs.default_payment_method) {
        method = userPrefs.default_payment_method.toUpperCase();
      }

      const res = await executeAgentTool('finalize_bill', { payment_method: method }, context);
      if (res.error) return { text: `❌ Finalization Rejected: ${res.error}` };

      const b = res.result;
      return {
        text: `✅ <b>Sale Finalized!</b>\n\n<b>Bill #${b.billNumber}</b>\n• Customer: ${b.customerName}\n• Payment Method: <b>${b.paymentMethod}</b>\n• Subtotal: ₹${b.subtotal}\n• CGST: ₹${b.cgst}\n• SGST: ₹${b.sgst}\n• Grand Total: <b>₹${b.total}</b>\n• Finalized At: ${new Date(b.finalizedAt).toLocaleTimeString()}\n\n<i>Inventory stock deducted. Your GST PDF Tax Invoice document is attached below.</i>`,
        artifacts: res.artifactPath && res.artifactType ? [{ path: res.artifactPath, type: res.artifactType }] : undefined,
      };
    }

    // 7. Save Preferences
    if (lower.includes('always use') || lower.includes('prefer ')) {
      let prefVal = 'UPI';
      if (lower.includes('upi')) prefVal = 'UPI';
      else if (lower.includes('cash')) prefVal = 'CASH';
      else if (lower.includes('card')) prefVal = 'CARD';

      await executeAgentTool('set_preference', { key: 'default_payment_method', value: prefVal }, context);

      return {
        text: `⚙️ Preference saved.\n\ndefault_payment_method = ${prefVal}\nThis preference will persist across sessions.`,
      };
    }

    // 8. Khata Credit
    if (lower.includes('khata') && (lower.includes('put ') || lower.includes('add '))) {
      const match = text.match(/(?:put|add)\s+(\d+(?:\.\d+)?)\s+on\s+([a-zA-Z0-9\s']+)'s\s+khata/i);
      if (match) {
        const amount = parseFloat(match[1]);
        const name = match[2].trim();

        const res = await executeAgentTool('add_credit', { customer_name: name, amount }, context);
        if (res.error) return { text: `❌ Error: ${res.error}` };

        return {
          text: `📖 Khata updated.\n\nCustomer: ${res.result.customer.name}\nCredit added: +₹${res.result.addedAmount}\nCurrent balance owed: ₹${res.result.currentBalance}`,
        };
      }
    }

    // 9. Khata Payment
    if (lower.includes('paid')) {
      const match = text.match(/([a-zA-Z0-9\s']+?)\s+paid\s+(\d+(?:\.\d+)?)/i);
      if (match) {
        const name = match[1].trim();
        const amount = parseFloat(match[2]);

        const res = await executeAgentTool('record_payment', { customer_name: name, amount }, context);
        if (res.error) return { text: `❌ Error: ${res.error}` };

        return {
          text: `💳 Payment recorded.\n\nCustomer: ${res.result.customer.name}\nAmount received: ₹${res.result.paidAmount}\nRemaining balance: ₹${res.result.remainingBalance}`,
        };
      }
    }

    // 10. Khata Balance Query
    if (lower.includes('balance') || lower.includes('khata')) {
      const match = text.match(/(?:what's|what is|get|check)?\s*([a-zA-Z0-9\s']+?)'s\s+balance/i);
      const name = match ? match[1].trim() : 'Ramesh';

      const res = await executeAgentTool('get_credit_balance', { customer_name: name }, context);
      if (res.error) return { text: `❌ Error: ${res.error}` };

      return {
        text: `📖 Khata Balance:\n\nCustomer: ${res.result.name}\nOutstanding Credit Balance: ₹${res.result.creditBalance}`,
      };
    }

    // 11. Reports
    if (lower.includes('today\'s sales') || lower.includes('sales')) {
      const res = await executeAgentTool('get_today_sales', {}, context);
      if (res.error) return { text: `❌ Error: ${res.error}` };

      const r = res.result;
      return {
        text: `📈 Today's Sales Summary (${r.period}):\n\nTotal Bills: ${r.totalBills}\nSubtotal: ₹${r.totalSubtotal}\nCGST: ₹${r.totalCgst}\nSGST: ₹${r.totalSgst}\nTotal Sales: ₹${r.totalSales}\nAverage Bill Value: ₹${r.averageBillValue}\n\nPayment Breakdown:\n• UPI: ₹${r.paymentBreakdown.UPI.total}\n• CASH: ₹${r.paymentBreakdown.CASH.total}\n• CARD: ₹${r.paymentBreakdown.CARD.total}\n• CREDIT: ₹${r.paymentBreakdown.CREDIT.total}`,
      };
    }

    // 12. Top Selling Products
    if (lower.includes('sell the most') || lower.includes('top product') || lower.includes('top selling')) {
      const res = await executeAgentTool('get_top_products', { limit: 5 }, context);
      if (res.error) return { text: `❌ Error: ${res.error}` };

      const items = res.result;
      if (items.length === 0) return { text: '📊 No sales recorded today yet.' };

      const listStr = items.map((i: any) => `• ${i.productName}: ${i.quantity} sold (₹${i.revenue.toFixed(2)})`).join('\n');
      return { text: `🔥 Top Selling Products Today:\n\n${listStr}` };
    }

    // 13. PDF Invoice
    if (lower.includes('pdf') || lower.includes('invoice')) {
      const pdfRes = await executeAgentTool('generate_invoice_pdf', {}, context);
      if (pdfRes.error) return { text: `❌ PDF Error: ${pdfRes.error}` };

      return {
        text: `📄 Here is your GST Tax Invoice PDF.`,
        artifacts: [{ path: pdfRes.artifactPath!, type: 'pdf' }],
      };
    }

    // 14. PPTX Sales Presentation
    if (lower.includes('pptx') || lower.includes('presentation') || lower.includes('sales analysis')) {
      const pptxRes = await executeAgentTool('generate_sales_analysis_pptx', { period: 'today' }, context);
      if (pptxRes.error) return { text: `❌ PPTX Error: ${pptxRes.error}` };

      return {
        text: `📊 Here is your 3-slide Sales Analysis PowerPoint Presentation.`,
        artifacts: [{ path: pptxRes.artifactPath!, type: 'pptx' }],
      };
    }

    // Default search fallback
    const searchRes = await executeAgentTool('search_products', { query: text }, context);
    if (searchRes.result && searchRes.result.length > 0) {
      const list = searchRes.result.map((p: any) => `• ${p.name} (${p.category}): ₹${p.sellingPrice} [Stock: ${p.stockQuantity} ${p.unit}]`).join('\n');
      return { text: `🔎 Products Matching "${text}":\n\n${list}` };
    }

    return {
      text: `👋 I am NovaMart. How can I assist with your store operations today?`,
    };
  }
}

export { NovaMartAgent as KiranaOpsAgent };
