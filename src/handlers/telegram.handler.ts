import { Context, InputFile } from 'grammy';
import { KiranaOpsAgent } from '../agent/agent';

const agent = new KiranaOpsAgent();

/**
 * Format raw markdown or plain text response into safe Telegram HTML markup.
 * Converts markdown bold (**text** -> <b>text</b>), headers (### -> <b>header</b>),
 * and Markdown tables into clean bulleted lists.
 */
export function formatTelegramText(input: string): string {
  if (!input) return '';

  let text = input;

  // 1. Convert Markdown tables (| Col1 | Col2 | ... |) to clean bullet lists
  const tableRegex = /\|[^\n]+\|\n\|[-:\s|]+\|\n((?:\|[^\n]+\|\n?)+)/g;
  text = text.replace(tableRegex, (_match, body) => {
    const rows = body.trim().split('\n');
    const formattedRows = rows
      .map((row: string) => {
        const cells = row
          .split('|')
          .map((c) => c.trim())
          .filter(Boolean);
        if (cells.length === 0) return '';
        if (cells.length >= 4) {
          return `• <b>${cells[0]}</b>: ${cells[1]} × ${cells[2]} = ${cells[3]}`;
        } else if (cells.length === 3) {
          return `• <b>${cells[0]}</b>: ${cells[1]} — ${cells[2]}`;
        } else if (cells.length === 2) {
          return `• <b>${cells[0]}</b>: ${cells[1]}`;
        }
        return `• ${cells.join(' — ')}`;
      })
      .filter(Boolean);
    return '\n' + formattedRows.join('\n') + '\n';
  });

  // 2. Convert markdown headers (### Header -> <b>Header</b>)
  text = text.replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>');

  // 3. Convert markdown bold (**text** -> <b>text</b>)
  text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

  // 4. Convert markdown italic (*text* -> <i>text</i>)
  text = text.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<i>$1</i>');

  // 5. Clean redundant line breaks
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Handle incoming Telegram text messages.
 * Passes message directly to KiranaOps AI Agent, receives response, and returns formatted text/documents.
 */
export async function handleTelegramMessage(ctx: Context) {
  if (!ctx.message || !ctx.message.text) return;

  const text = ctx.message.text;
  const telegramId = String(ctx.from?.id || 'default_user');

  try {
    await ctx.replyWithChatAction('typing');

    // Pass message to AI Agent
    const agentResponse = await agent.processMessage(text, telegramId);

    // Send formatted text response
    if (agentResponse.text) {
      const htmlText = formatTelegramText(agentResponse.text);
      try {
        await ctx.reply(htmlText, { parse_mode: 'HTML' });
      } catch (err) {
        // Fallback to plain text if HTML parsing fails
        await ctx.reply(agentResponse.text);
      }
    }

    // Send generated PDF/PPTX artifact documents
    if (agentResponse.artifacts && agentResponse.artifacts.length > 0) {
      for (const artifact of agentResponse.artifacts) {
        await ctx.replyWithChatAction('upload_document');
        await ctx.replyWithDocument(new InputFile(artifact.path));
      }
    }
  } catch (err: any) {
    console.error('Telegram Handler Error:', err);
    await ctx.reply(`⚠️ Sorry, an error occurred while processing your request: ${err.message || err}`);
  }
}
