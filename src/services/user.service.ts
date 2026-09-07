import prisma from '../db/prisma';

export class UserService {
  /**
   * Find or create user by Telegram ID.
   */
  static async findOrCreateUser(
    telegramId: string,
    username?: string,
    firstName?: string,
    lastName?: string
  ) {
    let user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId,
          username,
          firstName,
          lastName,
        },
      });
    } else if (username !== undefined || firstName !== undefined || lastName !== undefined) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          username: username ?? user.username,
          firstName: firstName ?? user.firstName,
          lastName: lastName ?? user.lastName,
        },
      });
    }

    return user;
  }
}
