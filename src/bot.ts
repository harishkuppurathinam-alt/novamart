import { Bot } from 'grammy';
import { config } from './config';
import { handleTelegramMessage } from './handlers/telegram.handler';

export const bot = new Bot(config.botToken);

// Handle /start command
bot.command('start', async (ctx) => {
  await ctx.reply(
    `👋 <b>Welcome to NovaMart</b>\n\n` +
      `I am your AI assistant for supermarket operations. You can operate your store using natural language.\n\n` +
      `<b>Try:</b>\n` +
      `• How much Maggi is left?\n` +
      `• 50 packets of Maggi came in, cost 12 each and MRP is 14\n` +
      `• Make a bill for 2 sugar and 4 Maggi\n` +
      `• Remove sugar and make Maggi 6\n` +
      `• Finalize with UPI\n` +
      `• Put 500 on Ramesh's khata\n` +
      `• Ramesh paid 300\n` +
      `• What's Ramesh's balance?\n` +
      `• Always use UPI unless I say cash\n` +
      `• Show today's sales\n` +
      `• Send me the invoice as PDF\n` +
      `• Generate this week's sales analysis`,
    { parse_mode: 'HTML' }
  );
});

// Handle /help command
bot.command('help', async (ctx) => {
  await ctx.reply(
    `ℹ️ <b>NovaMart Commands & Help</b>:\n\n` +
      `<b>/start</b> - Start NovaMart assistant\n` +
      `<b>/help</b> - Show help and examples\n` +
      `<b>/new</b> - Reset conversation context (retains store data, stock, bills, & preferences)\n\n` +
      `Simply type your operational request in plain English!`,
    { parse_mode: 'HTML' }
  );
});

// Handle /new command (Resets conversation context without deleting DB business data)
bot.command('new', async (ctx) => {
  await ctx.reply(
    `🔄 <b>Conversational context reset.</b>\n\nYour products, inventory stock, bills, customers, khata ledger, and stored preferences remain intact.`,
    { parse_mode: 'HTML' }
  );
});

// Pass all text messages to the AI Agent handler
bot.on('message:text', handleTelegramMessage);

// Global Error Handler
bot.catch((err) => {
  console.error('Unhandled Bot Error:', err.error);
});

// Start bot if executed directly
if (require.main === module) {
  console.log('🤖 NovaMart AI Supermarket Operations Bot is starting...');
  bot.start({
    onStart: (botInfo) => {
      console.log(`✅ NovaMart Bot @${botInfo.username} is active and listening for messages!`);
    },
  });
}
