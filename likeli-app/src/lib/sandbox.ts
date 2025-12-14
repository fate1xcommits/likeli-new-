// lib/sandbox.ts
// Sandbox market implementation with graduation phases and multi-choice support

import {
    Pool,
    createPool,
    getProb,
    buyShares,
    sellShares,
    createMultiChoiceAnswers,
    buyAnswerShares,
    sellAnswerShares,
    LIQUIDITY_MULTIPLIER
} from './cpmm';

import {
    MarketPhase,
    OutcomeType,
    Resolution,
    Answer,
    GRADUATION_VOLUME_THRESHOLD,
    GRADUATION_TIMER_MS,
    checkGraduationEligibility,
    checkGraduationComplete,
    generateId,
    generateSlug
} from './graduation';
import { Answer as ManifoldAnswer, noFees } from './manifold/types';
import { calculateCpmmMultiArbitrageBet } from './manifold/calculate-cpmm-arbitrage';
import { getCpmmProbability } from './manifold/calculate-cpmm';

// ============================================
// TYPES
// ============================================

export type Outcome = "YES" | "NO";

export interface SandboxMarket {
    id: string;
    slug: string;
    question: string;
    category: string;
    resolutionDate: string;
    rules: string;
    creatorId: string;

    // Market type
    outcomeType: OutcomeType;

    // Phase & Graduation
    phase: MarketPhase;
    graduationStartTime?: number;

    // Pool (for BINARY markets)
    pool: Pool;

    // Answers (for MULTIPLE_CHOICE markets)
    answers?: Answer[];
    // Multi-choice mode: true = dependent (sum to 100%), false = independent
    shouldAnswersSumToOne?: boolean;

    // Stats
    volume: number;
    uniqueBettorCount: number;
    totalLiquidity: number;

    // Timestamps
    createdTime: number;
    lastBetTime?: number;

    // Resolution
    resolution?: Resolution;
    resolutionProbability?: number;
    resolutionTime?: number;

    // Price history for charts
    priceHistory: Array<{
        timestamp: number;
        yesPrice: number;
        noPrice: number;
        probYes: number;
        probNo: number;
    }>;
}

export interface SandboxUser {
    id: string;
    cash: number;
    positions: Record<string, number>; // key: "marketId-YES" or "marketId-NO" or "marketId-answerId", value: shares
}

// ============================================
// GLOBAL SINGLETON STORE
// ============================================

declare global {
    var _sandboxMarkets: Map<string, SandboxMarket>;
    var _sandboxUsers: Map<string, SandboxUser>;
}

if (!global._sandboxMarkets) {
    global._sandboxMarkets = new Map<string, SandboxMarket>();
}
if (!global._sandboxUsers) {
    global._sandboxUsers = new Map<string, SandboxUser>();
}

export const sandboxMarkets = global._sandboxMarkets;
export const sandboxUsers = global._sandboxUsers;

// ============================================
// CPMM RE-EXPORTS
// ============================================

export { buyShares, sellShares, getProb, createPool } from './cpmm';

// ============================================
// MARKET CREATION
// ============================================

/**
 * Create a new BINARY sandbox market
 */
export function createSandboxMarket(
    question: string,
    category: string,
    resolutionDate: string,
    initialLiquidityUsd: number,
    rules: string = "",
    creatorId: string = "demo-user"
): SandboxMarket {
    const id = `sb_${generateId().slice(0, 8)}`;
    const slug = generateSlug(question);
    const pool = createPool(initialLiquidityUsd, 0.5);
    const now = Date.now();

    const market: SandboxMarket = {
        id,
        slug,
        question,
        category,
        resolutionDate,
        rules,
        creatorId,
        outcomeType: 'BINARY',
        phase: 'sandbox',
        pool,
        volume: 0,
        uniqueBettorCount: 0,
        totalLiquidity: initialLiquidityUsd * LIQUIDITY_MULTIPLIER,
        createdTime: now,
        priceHistory: [],
    };

    // Initial price snapshot
    recordSandboxPriceSnapshot(market);

    return market;
}

/**
 * Create a new MULTIPLE_CHOICE sandbox market
 */
export function createMultiChoiceSandboxMarket(
    question: string,
    category: string,
    resolutionDate: string,
    initialLiquidityUsd: number,
    answerTexts: string[],
    rules: string = "",
    creatorId: string = "demo-user",
    shouldAnswersSumToOne: boolean = true // Default to dependent (sum-to-one)
): SandboxMarket {
    const id = `sb_${generateId().slice(0, 8)}`;
    const slug = generateSlug(question);
    const answers = createMultiChoiceAnswers(initialLiquidityUsd, answerTexts);
    const now = Date.now();

    // For multi-choice, pool represents combined state
    const totalPool = {
        YES: answers.reduce((sum, a) => sum + a.pool.YES, 0),
        NO: answers.reduce((sum, a) => sum + a.pool.NO, 0),
    };

    const market: SandboxMarket = {
        id,
        slug,
        question,
        category,
        resolutionDate,
        rules,
        creatorId,
        outcomeType: 'MULTIPLE_CHOICE',
        shouldAnswersSumToOne, // CRITICAL: enables arbitrage for dependent markets
        phase: 'sandbox',
        pool: totalPool,
        answers,
        volume: 0,
        uniqueBettorCount: 0,
        totalLiquidity: initialLiquidityUsd * LIQUIDITY_MULTIPLIER,
        createdTime: now,
        priceHistory: [],
    };

    console.log(`[CreateMarket] Multi-choice market created: shouldAnswersSumToOne=${shouldAnswersSumToOne}`);

    return market;
}

// ============================================
// PROBABILITY & PRICE
// ============================================

/**
 * Get current probability and prices for a BINARY market
 */
export function getProbability(market: SandboxMarket) {
    const probYes = getProb(market.pool);
    const probNo = 1 - probYes;
    return { probYes, probNo, yesPrice: probYes, noPrice: probNo };
}

/**
 * Record a price snapshot for chart history
 */
export function recordSandboxPriceSnapshot(market: SandboxMarket) {
    const { probYes, probNo, yesPrice, noPrice } = getProbability(market);

    market.priceHistory.push({
        timestamp: Date.now(),
        yesPrice,
        noPrice,
        probYes,
        probNo
    });

    // Keep only last 500 points
    if (market.priceHistory.length > 500) {
        market.priceHistory = market.priceHistory.slice(-500);
    }
}

// ============================================
// TRADING - BINARY MARKETS
// ============================================

/**
 * Execute a buy trade on a BINARY sandbox market
 */
export function executeSandboxBuy(
    market: SandboxMarket,
    user: SandboxUser,
    outcome: Outcome,
    amountUsd: number
): { shares: number; probAfter: number } {
    if (user.cash < amountUsd) {
        throw new Error("Insufficient balance");
    }
    if (market.resolution) {
        throw new Error("Market is resolved");
    }

    const result = buyShares(market.pool, outcome, amountUsd);

    // Update market
    market.pool = result.newPool;
    market.volume += amountUsd;
    market.lastBetTime = Date.now();

    // Update user
    user.cash -= amountUsd;
    const posKey = `${market.id}-${outcome}`;
    user.positions[posKey] = (user.positions[posKey] || 0) + result.shares;

    // Record history
    recordSandboxPriceSnapshot(market);

    // Check graduation eligibility
    updateMarketPhase(market);

    return {
        shares: result.shares,
        probAfter: result.probAfter
    };
}

/**
 * Execute a sell trade on a BINARY sandbox market
 */
export function executeSandboxSell(
    market: SandboxMarket,
    user: SandboxUser,
    outcome: Outcome,
    sharesToSell: number
): { payout: number; probAfter: number } {
    if (market.resolution) {
        throw new Error("Market is resolved");
    }

    const posKey = `${market.id}-${outcome}`;
    const currentShares = user.positions[posKey] || 0;
    const actualShares = Math.min(sharesToSell, currentShares);

    if (actualShares <= 0) {
        throw new Error("Insufficient shares");
    }

    const result = sellShares(market.pool, outcome, actualShares);

    // Update market
    market.pool = result.newPool;
    market.lastBetTime = Date.now();

    // Update user
    user.cash += result.payout;
    user.positions[posKey] -= actualShares;

    // Record history
    recordSandboxPriceSnapshot(market);

    return {
        payout: result.payout,
        probAfter: result.probAfter
    };
}

// ============================================
// TRADING - MULTI-CHOICE MARKETS
// ============================================

/**
 * Buy shares on a specific answer
 */
export function executeSandboxAnswerBuy(
    market: SandboxMarket,
    user: SandboxUser,
    answerId: string,
    amountUsd: number
): { shares: number; probAfter: number } {
    if (!market.answers) {
        throw new Error("Not a multi-choice market");
    }
    if (user.cash < amountUsd) {
        throw new Error("Insufficient balance");
    }
    if (market.resolution) {
        throw new Error("Market is resolved");
    }

    const answerIndex = market.answers.findIndex(a => a.id === answerId);
    if (answerIndex === -1) {
        throw new Error("Answer not found");
    }

    const { answer: updatedAnswer, shares } = buyAnswerShares(
        market.answers[answerIndex],
        amountUsd
    );

    // Update answer
    market.answers[answerIndex] = updatedAnswer;
    market.volume += amountUsd;
    market.lastBetTime = Date.now();

    // Update user
    user.cash -= amountUsd;
    const posKey = `${market.id}-${answerId}`;
    user.positions[posKey] = (user.positions[posKey] || 0) + shares;

    // Check graduation
    updateMarketPhase(market);

    return {
        shares,
        probAfter: updatedAnswer.prob
    };
}

/**
 * Execute a Multi-Choice BUY using Manifold's Exact Arbitrage/Normalization Logic
 * Adapts Sandbox types to Manifold types, runs common logic, and updates Sandbox state.
 */
export function executeSandboxMultiArbitrageBuy(
    market: SandboxMarket,
    user: SandboxUser,
    answerId: string,
    amountUsd: number
): { shares: number; probAfter: number } {
    if (!market.answers) throw new Error("Not a multi-choice market");
    if (user.cash < amountUsd) throw new Error("Insufficient balance");
    if (market.resolution) throw new Error("Market is resolved");

    // 1. Adapt to Manifold Answers
    const manifoldAnswers: ManifoldAnswer[] = market.answers.map(a => ({
        id: a.id,
        contractId: market.id,
        poolYes: a.pool.YES,
        poolNo: a.pool.NO,
        prob: a.prob,
        p: 0.5, // Sandbox assumes 0.5 default
        text: a.text,
        index: a.index,
        volume: a.volume,
        totalLiquidity: 0,
        subsidyPool: 0,
        createdTime: market.createdTime
    }));

    const targetAnswer = manifoldAnswers.find(a => a.id === answerId);
    if (!targetAnswer) throw new Error("Answer not found");

    // 2. Run Arbitrage Logic (Exact Manifold Implementation)
    const { newBetResult, otherBetResults } = calculateCpmmMultiArbitrageBet(
        manifoldAnswers,
        targetAnswer,
        'YES',
        amountUsd,
        undefined, // limitProb
        [], // unfilledBets (no limit orders in sandbox)
        {}, // balanceByUserId
        noFees // collectedFees
    );

    // DEBUG: Log arbitrage results
    console.log('[Arbitrage] Input:', { answerId, amountUsd, numAnswers: manifoldAnswers.length });
    console.log('[Arbitrage] newBetResult:', {
        outcome: newBetResult.outcome,
        takers: newBetResult.takers.length,
        pool: newBetResult.cpmmState.pool
    });
    console.log('[Arbitrage] otherBetResults:', otherBetResults.map(r => ({
        answerId: r.answer.id,
        outcome: r.outcome,
        takers: r.takers.length,
        pool: r.cpmmState.pool
    })));

    // 3. Apply Main Bet (YES) Update
    const targetIdx = market.answers.findIndex(a => a.id === answerId);
    market.answers[targetIdx].pool = {
        YES: newBetResult.cpmmState.pool.YES,
        NO: newBetResult.cpmmState.pool.NO
    };
    // Recalculate prob from new pool (more reliable than using answer.prob)
    market.answers[targetIdx].prob = getProb(market.answers[targetIdx].pool, 0.5);

    // Sum all taker amounts for volume
    const mainTakerAmount = newBetResult.takers.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    market.answers[targetIdx].volume += mainTakerAmount;

    // Update User Position (YES) - sum all taker shares
    const yesShares = newBetResult.takers.reduce((sum, t) => sum + t.shares, 0);
    const posKeyYes = `${market.id}-${answerId}`;
    user.positions[posKeyYes] = (user.positions[posKeyYes] || 0) + yesShares;

    // 4. Apply Side Bets (NO) Updates - THIS IS THE CRITICAL PART
    for (const res of otherBetResults) {
        const sideIdx = market.answers.findIndex(a => a.id === res.answer.id);
        if (sideIdx !== -1) {
            // Update pool from arbitrage result
            market.answers[sideIdx].pool = {
                YES: res.cpmmState.pool.YES,
                NO: res.cpmmState.pool.NO
            };
            // Recalculate prob from new pool
            market.answers[sideIdx].prob = getProb(market.answers[sideIdx].pool, 0.5);

            // Sum all taker amounts for volume (may be negative for redemptions)
            const sideTakerAmount = res.takers.reduce((sum, t) => sum + Math.abs(t.amount), 0);
            market.answers[sideIdx].volume += sideTakerAmount;

            // Update User Position (NO) - sum all taker shares
            const noShares = res.takers.reduce((sum, t) => sum + t.shares, 0);
            if (noShares > 0) {
                const posKeyNo = `${market.id}-${res.answer.id}-NO`;
                user.positions[posKeyNo] = (user.positions[posKeyNo] || 0) + noShares;
            }
        }
    }

    // DEBUG: Log final probabilities
    const finalProbs = market.answers.map(a => ({ id: a.id, text: a.text, prob: a.prob }));
    const probSum = market.answers.reduce((sum, a) => sum + a.prob, 0);
    console.log('[Arbitrage] Final probs:', finalProbs, 'Sum:', probSum);

    // 5. Update Market/User Stats
    user.cash -= amountUsd;
    market.volume += amountUsd;
    market.lastBetTime = Date.now();

    updateMarketPhase(market);

    return {
        shares: yesShares,
        probAfter: market.answers[targetIdx].prob
    };
}

/**
 * Sell shares on a specific answer
 */
export function executeSandboxAnswerSell(
    market: SandboxMarket,
    user: SandboxUser,
    answerId: string,
    sharesToSell: number
): { payout: number; probAfter: number } {
    if (!market.answers) {
        throw new Error("Not a multi-choice market");
    }
    if (market.resolution) {
        throw new Error("Market is resolved");
    }

    const answerIndex = market.answers.findIndex(a => a.id === answerId);
    if (answerIndex === -1) {
        throw new Error("Answer not found");
    }

    const posKey = `${market.id}-${answerId}`;
    const currentShares = user.positions[posKey] || 0;
    const actualShares = Math.min(sharesToSell, currentShares);

    if (actualShares <= 0) {
        throw new Error("Insufficient shares");
    }

    const { answer: updatedAnswer, payout } = sellAnswerShares(
        market.answers[answerIndex],
        actualShares
    );

    // Update answer
    market.answers[answerIndex] = updatedAnswer;
    market.lastBetTime = Date.now();

    // Update user
    user.cash += payout;
    user.positions[posKey] -= actualShares;

    return {
        payout,
        probAfter: updatedAnswer.prob
    };
}

// ============================================
// GRADUATION PHASE MANAGEMENT
// ============================================

/**
 * Update market phase based on volume and timer
 */
export function updateMarketPhase(market: SandboxMarket): void {
    // Check sandbox → graduating
    if (checkGraduationEligibility(market.phase, market.volume)) {
        market.phase = 'graduating';
        market.graduationStartTime = Date.now();
        console.log(`[Graduation] Market ${market.id} started graduation at volume $${market.volume}`);
    }

    // Check graduating → main
    if (checkGraduationComplete(market.phase, market.graduationStartTime)) {
        market.phase = 'main';
        console.log(`[Graduation] Market ${market.id} graduated to main!`);
    }
}

/**
 * Check all markets for graduation completion
 * Call this periodically (e.g., every 30 seconds)
 */
export function checkAllGraduations(): void {
    sandboxMarkets.forEach((market, id) => {
        if (market.phase === 'graduating') {
            updateMarketPhase(market);
            sandboxMarkets.set(id, market);
        }
    });
}

// ============================================
// MARKET RESOLUTION
// ============================================

/**
 * Resolve a BINARY market
 */
export function resolveSandboxMarket(
    market: SandboxMarket,
    resolution: Resolution,
    resolutionProbability?: number
): void {
    market.resolution = resolution;
    market.resolutionProbability = resolutionProbability;
    market.resolutionTime = Date.now();
    market.phase = 'resolved';
}

/**
 * Resolve a MULTIPLE_CHOICE market (resolve specific answer)
 */
export function resolveSandboxAnswer(
    market: SandboxMarket,
    winningAnswerId: string
): void {
    if (!market.answers) {
        throw new Error("Not a multi-choice market");
    }

    market.answers.forEach(answer => {
        answer.resolution = answer.id === winningAnswerId ? 'YES' : 'NO';
    });

    market.resolution = 'YES'; // Market itself is resolved
    market.resolutionTime = Date.now();
    market.phase = 'resolved';
}

// ============================================
// POOL CREATION HELPER (backwards compat)
// ============================================

export function createSandboxPool(initialLiquidityUsd: number): Pool {
    return createPool(initialLiquidityUsd, 0.5);
}
