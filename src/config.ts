import dotenv from 'dotenv';
import path from 'path';

// Force dotenv to override process env with updated .env values
dotenv.config({ override: true });

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
};

if (!config.botToken) {
  throw new Error('BOT_TOKEN environment variable is missing.');
}
