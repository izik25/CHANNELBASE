import { Prisma, prisma } from "@channelbase/database";
import { createLogger } from "@channelbase/logger";
import type { CreditTransactionType } from "@channelbase/shared";

const log = createLogger("credit-service");

export class InsufficientCreditsError extends Error {
  constructor(userId: string, required: number, available: number) {
    super(`User ${userId} has insufficient credits: required ${required}, available ${available}`);
    this.name = "InsufficientCreditsError";
  }
}

/**
 * All credit balance mutations go through here so the wallet balance and its
 * transaction ledger can never drift apart — every change is one atomic
 * Prisma transaction that updates CreditWallet.balance and appends a
 * CreditTransaction row with the resulting balanceAfter.
 */
export class CreditService {
  async getOrCreateWallet(userId: string) {
    return prisma.creditWallet.upsert({
      where: { userId },
      update: {},
      create: { userId, balance: 0 },
    });
  }

  async getBalance(userId: string): Promise<number> {
    const wallet = await this.getOrCreateWallet(userId);
    return Number(wallet.balance);
  }

  /** amount is always positive; direction comes from `type`. */
  async applyTransaction(params: {
    userId: string;
    type: CreditTransactionType;
    amount: number;
    description?: string;
    referenceId?: string;
    allowNegativeBalance?: boolean;
  }): Promise<{ balanceAfter: number }> {
    const isDebit = params.type === "GENERATION";
    const signedAmount = isDebit ? -Math.abs(params.amount) : Math.abs(params.amount);

    return prisma.$transaction(async (tx) => {
      const wallet = await tx.creditWallet.upsert({
        where: { userId: params.userId },
        update: {},
        create: { userId: params.userId, balance: 0 },
      });

      const newBalance = new Prisma.Decimal(wallet.balance).plus(signedAmount);
      if (isDebit && newBalance.isNegative() && !params.allowNegativeBalance) {
        throw new InsufficientCreditsError(params.userId, params.amount, Number(wallet.balance));
      }

      await tx.creditWallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
      await tx.creditTransaction.create({
        data: {
          walletId: wallet.id,
          type: params.type,
          amount: signedAmount,
          balanceAfter: newBalance,
          description: params.description,
          referenceId: params.referenceId,
        },
      });

      log.debug({ userId: params.userId, type: params.type, amount: signedAmount, balanceAfter: newBalance.toString() }, "credit transaction applied");
      return { balanceAfter: Number(newBalance) };
    });
  }

  charge(userId: string, amount: number, description?: string, referenceId?: string) {
    return this.applyTransaction({ userId, type: "GENERATION", amount, description, referenceId });
  }

  grant(userId: string, amount: number, type: Extract<CreditTransactionType, "PURCHASE" | "SUBSCRIPTION_GRANT" | "MANUAL_ADJUSTMENT">, description?: string) {
    return this.applyTransaction({ userId, type, amount, description });
  }

  refund(userId: string, amount: number, description?: string, referenceId?: string) {
    return this.applyTransaction({ userId, type: "REFUND", amount, description, referenceId });
  }
}
