import prisma from '../db/prisma';
import { UserService } from './user.service';

export class PreferenceService {
  /**
   * Set user preference in persistent memory.
   */
  static async setPreference(telegramIdOrUserId: string | number, key: string, value: string) {
    let userId: number;
    if (typeof telegramIdOrUserId === 'string') {
      const user = await UserService.findOrCreateUser(telegramIdOrUserId);
      userId = user.id;
    } else {
      userId = telegramIdOrUserId;
    }

    const normKey = key.trim().toLowerCase().replace(/\s+/g, '_');
    const normValue = value.trim();

    return prisma.preference.upsert({
      where: {
        userId_key: {
          userId,
          key: normKey,
        },
      },
      update: { value: normValue },
      create: {
        userId,
        key: normKey,
        value: normValue,
      },
    });
  }

  /**
   * Get specific preference value for user.
   */
  static async getPreference(telegramIdOrUserId: string | number, key: string) {
    let userId: number;
    if (typeof telegramIdOrUserId === 'string') {
      const user = await prisma.user.findUnique({
        where: { telegramId: telegramIdOrUserId },
      });
      if (!user) return null;
      userId = user.id;
    } else {
      userId = telegramIdOrUserId;
    }

    const normKey = key.trim().toLowerCase().replace(/\s+/g, '_');
    const pref = await prisma.preference.findUnique({
      where: {
        userId_key: {
          userId,
          key: normKey,
        },
      },
    });

    return pref ? pref.value : null;
  }

  /**
   * Get all preferences for a user as a record map.
   */
  static async getAllPreferences(telegramIdOrUserId: string | number) {
    let userId: number;
    if (typeof telegramIdOrUserId === 'string') {
      const user = await prisma.user.findUnique({
        where: { telegramId: telegramIdOrUserId },
      });
      if (!user) return {};
      userId = user.id;
    } else {
      userId = telegramIdOrUserId;
    }

    const prefs = await prisma.preference.findMany({
      where: { userId },
    });

    const result: Record<string, string> = {};
    for (const p of prefs) {
      result[p.key] = p.value;
    }
    return result;
  }
}
