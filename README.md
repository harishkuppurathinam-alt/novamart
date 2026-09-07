# 🛒 NovaMart - AI Supermarket Operations Agent (Telegram Bot)

**NovaMart** is an intelligent AI-powered Telegram supermarket operations agent. Instead of conventional button-driven command menus or hardcoded if/else intent routers, this bot processes natural-language instructions from supermarket owners and staff to manage **Inventory**, **Multi-turn Billing**, **Automatic Product Substitution**, **Khata Credit Ledgers**, **Sales Reports**, **Persistent User Preferences**, and **PDF / PPTX Document Generation**.

---

## 🏗 Architecture & Design

```
Telegram Message
       │
       ▼
grammY Bot Layer (src/handlers/telegram.handler.ts)
       │
       ▼
NovaMart AI Agent Layer (src/agent/agent.ts)
       │
       ├── Invokes Tools ──► Business Services ──► Prisma ORM ──► SQLite (dev.db)
       │                        │
       ◄── Tool Result ─────────┘
       │
       ▼
Agent Natural Language Response + Generated Artifacts (PDF / PPTX)
       │
       ▼
Telegram User
```

### Why an Agent Architecture is Used
- **Natural Language Flexibility**: Shopkeepers can speak or type in plain language (e.g. *"50 packets of Maggi came in, cost 12 each and MRP is 14"* or *"Put 500 on Ramesh's khata"*).
- **Tool Orchestration**: The AI LLM agent selects strongly-typed service tools deterministically without hardcoded router trees.

---

## 🌟 Implemented Capabilities & Agent Tools

| Category | Available Agent Tools | Business Description |
|---|---|---|
| **Inventory** | `search_products`, `get_stock`, `receive_stock`, `create_product`, `get_low_stock` | Product search, receiving incoming inventory safely, stock checks, and low-stock alerts. |
| **Billing** | `create_draft_bill`, `get_draft_bill`, `add_bill_item`, `update_bill_item`, `remove_bill_item`, `finalize_bill` | Multi-turn draft billing. Stock is **only** deducted upon transactional finalization. |
| **Khata Ledger** | `find_customer`, `add_credit`, `record_payment`, `get_credit_balance`, `get_credit_transactions` | Customer credit ledger tracking balances, credit additions, and payment repayments. |
| **Preferences** | `get_preference`, `set_preference` | Stores user default memory (e.g. `default_payment_method = UPI`) in SQLite independently of session state. |
| **Reporting** | `get_today_sales`, `get_sales_report`, `get_top_products`, `get_payment_breakdown` | Sales analytics, revenue totals, CGST/SGST calculations, top-selling items. |
| **Artifacts** | `generate_invoice_pdf`, `generate_sales_analysis_pptx` | GST Tax Invoice PDF (`pdfkit`) & 3-Slide Sales Analysis PPTX presentation (`pptxgenjs`). |

---

## 🔒 Critical Business Rules & Mechanisms

1. **No Hallucinated Data**: All stock counts, prices, customer balances, and reports are retrieved strictly from database tools.
2. **Automatic Product Substitution**: When a requested product size is unavailable in stock (e.g. user asks for 2x Tata Tea 500g, total 1000g), the system automatically selects the best available matching size (e.g. 4x Tata Tea 250g) and adds the equivalent quantity directly to the draft bill without requiring user input.
3. **Deterministic GST Calculation**: Tax calculations occur in deterministic TypeScript application code. GST is split equally into **CGST** (GST/2) and **SGST** (GST/2).
4. **Multi-Turn Draft Billing**: Bills remain `DRAFT` in SQLite across turns. Adding/modifying items does **not** alter stock.
5. **Atomic Finalization & Oversell Prevention**: `finalizeBill()` executes inside a Prisma `$transaction`. If any item has insufficient stock, the entire transaction rolls back atomically without partial stock updates.
6. **Idempotent Finalization**: Retried finalization requests use status checks to return the existing finalized bill without deducting stock twice.
7. **Clean Telegram HTML Formatting**: All bot responses render in clean Telegram HTML format with automated table-to-bullet list conversion.

---

## 🗄 Database Schema (`prisma/schema.prisma`)

- **`User`**: `id`, `telegramId` (unique), `username`, `firstName`, `lastName`, `createdAt`, `updatedAt`
- **`Product`**: `id`, `name`, `description`, `sku` (unique), `category`, `unit`, `costPrice`, `sellingPrice`, `mrp`, `gstRate`, `stockQuantity`, `reorderLevel`, `active`
- **`Bill`**: `id`, `billNumber` (unique), `userId`, `customerName`, `status` (`DRAFT`, `FINALIZED`, `CANCELLED`), `paymentMethod` (`CASH`, `UPI`, `CARD`, `CREDIT`), `subtotal`, `cgst`, `sgst`, `total`, `createdAt`, `finalizedAt`
- **`BillItem`**: `id`, `billId`, `productId`, `productNameSnapshot`, `quantity`, `unitPrice`, `gstRate`, `lineSubtotal`, `lineCgst`, `lineSgst`, `lineTotal`
- **`Customer`**: `id`, `name`, `phone` (unique), `creditBalance`
- **`KhataTransaction`**: `id`, `customerId`, `type` (`CREDIT`, `PAYMENT`), `amount`, `description`, `createdAt`
- **`Preference`**: `id`, `userId`, `key`, `value`

---

## 🚀 Quickstart & Setup

### 1. Prerequisites
- Node.js (v18+)
- Telegram Bot Token from [@BotFather](https://t.me/BotFather)

### 2. Environment Setup
Create `.env`:
```env
BOT_TOKEN="your_actual_bot_token_from_botfather"
GEMINI_API_KEY="" # Optional: Deterministic Tool Fallback active when empty
DATABASE_URL="file:./dev.db"
```

### 3. Install & Seed Database
```bash
npm install
npx prisma db push --force-reset
npm run seed
```

### 4. Run Business Services Unit Tests (14/14 Tests)
```bash
npm test
```

### 5. Run E2E Natural Language Simulation
```bash
npm run test:e2e
```

### 6. Start Live Bot Locally
```bash
npm run dev
```

---

## 🌐 Production Hosting Options

NovaMart requires a **long-running Node.js process** and **persistent disk storage** for SQLite (`dev.db`) and PDF/PPTX artifacts.

### Recommended Providers:

1. **Railway.app (Easiest Cloud PaaS)**
   - Connect GitHub repository to Railway.
   - Add a **Railway Volume** mounted at `/data` for `dev.db`.
   - Set environment variables (`BOT_TOKEN`, `GEMINI_API_KEY`).

2. **Render.com (Managed Hosting)**
   - Deploy as a **Background Worker** or **Web Service**.
   - Attach a **Render Disk** for SQLite database persistence.

3. **DigitalOcean / Hetzner VPS (Dedicated & Cost Effective)**
   - $4–$6/month Linux VM with full SSD storage.
   - Run 24/7 with PM2:
     ```bash
     npm run build
     pm2 start dist/bot.js --name novamart-bot
     ```

---

## 💬 Example Natural-Language Operations

- **Stock Lookup**: *"How much Maggi is left?"*
- **Receive Stock**: *"50 packets of Maggi came in, cost 12 each and MRP is 14."*
- **Draft Bill**: *"Make a bill for 2 sugar and 4 Maggi."*
- **Modify Bill**: *"Remove sugar and make Maggi 6."*
- **Finalize**: *"Finalize with UPI."*
- **Khata Credit**: *"Put 500 on Ramesh's khata."*
- **Khata Payment**: *"Ramesh paid 300."*
- **Khata Balance**: *"What's Ramesh's balance?"*
- **Preferences**: *"Always use UPI unless I say cash."*
- **Sales Report**: *"Give me today's sales."*
- **Invoice PDF**: *"Send me the invoice as PDF."*
- **Sales PPTX**: *"Generate this week's sales analysis."*
