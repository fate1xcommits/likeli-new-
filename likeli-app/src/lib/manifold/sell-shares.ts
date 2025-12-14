// lib/manifold/sell-shares.ts
// Sell Shares Logic - 100% Manifold Match

import { Pool, Bet, Answer, CPMM_MIN_POOL_QTY } from './types';
import { calculateCpmmSale, getCpmmProbability, generateId } from './cpmm';
import {
    getContract,
    saveContract,
    updateUserBalance,
    addBet,
    getOrCreateMetric,
    updateMetric,
    addPricePoint,
    getOrCreateUser
} from './store';

// ============================================
// SELL SHARES - MAIN FUNCTION
// ============================================

export interface SellSharesParams {
    contractId: string;
    outcome: 'YES' | 'NO';
    shares?: number;  // If undefined, sell all
    userId: string;
    answerId?: string;
}

export interface SellSharesResult {
    success: boolean;
    error?: string;
    bet?: Bet;
    payout?: number;
    probBefore?: number;
    probAfter?: number;
    newBalance?: number;
}

/**
 * Sell shares back to the market
 */
export function sellShares(params: SellSharesParams): SellSharesResult {
    const { contractId, outcome, shares: requestedShares, userId, answerId } = params;

    // 1. Get user position
    const metric = getOrCreateMetric(userId, contractId, answerId);

    const maxShares = outcome === 'YES'
        ? metric.totalSharesYes
        : metric.totalSharesNo;

    if (maxShares <= 0) {
        return { success: false, error: `No ${outcome} shares to sell` };
    }

    const sharesToSell = requestedShares ?? maxShares;
    if (sharesToSell > maxShares) {
        return { success: false, error: `Can only sell up to ${maxShares.toFixed(2)} shares` };
    }

    if (sharesToSell <= 0) {
        return { success: false, error: 'Shares must be positive' };
    }

    // 2. Get contract
    const contract = getContract(contractId);
    if (!contract) {
        return { success: false, error: 'Contract not found' };
    }

    if (contract.resolution) {
        return { success: false, error: 'Market already resolved' };
    }

    // 3. Get pool (answer or contract)
    let pool: Pool;
    let answer: Answer | undefined;

    if (contract.outcomeType === 'MULTIPLE_CHOICE' && answerId) {
        answer = contract.answers?.find(a => a.id === answerId);
        if (!answer) {
            return { success: false, error: 'Answer not found' };
        }
        pool = { YES: answer.poolYes, NO: answer.poolNo };
    } else {
        pool = contract.pool;
    }

    // 4. Calculate sale result
    const { payout, newPool, probBefore, probAfter } = calculateCpmmSale(
        pool,
        sharesToSell,
        outcome,
        answer?.p ?? contract.p ?? 0.5
    );

    // 5. Validate trade
    if (Math.min(newPool.YES, newPool.NO) < CPMM_MIN_POOL_QTY) {
        return { success: false, error: 'Sale would drain pool' };
    }

    if (payout <= 0) {
        return { success: false, error: 'Payout must be positive' };
    }

    // 6. Create "sell" bet (negative amount)
    const betId = generateId();
    const now = Date.now();

    const bet: Bet = {
        id: betId,
        contractId,
        userId,
        amount: -payout,  // Negative for sells
        shares: -sharesToSell,  // Negative shares
        outcome,
        probBefore,
        probAfter,
        answerId,
        isRedemption: false,
        isFilled: true,
        isCancelled: false,
        createdTime: now
    };

    // 7. Update user balance (add payout)
    const user = getOrCreateUser(userId);
    updateUserBalance(userId, payout);

    // 8. Save bet
    addBet(contractId, bet);

    // 9. Update contract/answer pool
    if (answer) {
        answer.poolYes = newPool.YES;
        answer.poolNo = newPool.NO;
        answer.prob = getCpmmProbability(newPool, answer.p ?? contract.p ?? 0.5);
        answer.volume += payout;
    } else {
        contract.pool = newPool;
        // contract.p = probAfter; // Do NOT update p
    }

    contract.volume += payout;
    contract.lastBetTime = now;
    contract.lastUpdatedTime = now;
    saveContract(contract);

    // 10. Update user position
    if (outcome === 'YES') {
        metric.totalSharesYes -= sharesToSell;
        metric.hasYesShares = metric.totalSharesYes > 0;
    } else {
        metric.totalSharesNo -= sharesToSell;
        metric.hasNoShares = metric.totalSharesNo > 0;
    }
    updateMetric(metric);

    // 11. Add price point
    addPricePoint(contractId, probAfter);

    // 12. Return result
    return {
        success: true,
        bet,
        payout,
        probBefore,
        probAfter,
        newBalance: user.balance + payout
    };
}

/**
 * Get user's sellable shares for a contract
 */
export function getSellableShares(
    userId: string,
    contractId: string,
    answerId?: string
): { yesShares: number; noShares: number } {
    const metric = getOrCreateMetric(userId, contractId, answerId);
    return {
        yesShares: metric.totalSharesYes,
        noShares: metric.totalSharesNo
    };
}
