"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import MyBets from "./MyBets";
import { TrendingUp, Wallet } from "lucide-react";

interface TradePanelProps {
    mode: "simple" | "advanced";
    market: any; // Using any for now to decouple from store types completely
    onOrderPlaced?: () => void;
    currentPrice?: number; // Current YES price (0-1)
    bestAsk?: number;      // Best Ask price for YES (to estimate Buy shares)
}

export default function TradePanel({ mode, market, onOrderPlaced, currentPrice = 0.5, bestAsk }: TradePanelProps) {
    // Local state for form
    const [tradeSide, setTradeSide] = useState<"BUY" | "SELL">("BUY");
    const [outcomeId, setOutcomeId] = useState<"yes" | "no">("yes");
    const [amount, setAmount] = useState("");
    const [limitPrice, setLimitPrice] = useState("");
    const [isLimit, setIsLimit] = useState(false);

    // Dynamic Prices (Sandbox support)
    const isSandbox = market?.phase === "sandbox_curve";
    const [yesPriceState, setYesPriceState] = useState(market?.currentPrices?.probYes ?? currentPrice);
    const [noPriceState, setNoPriceState] = useState(market?.currentPrices?.probNo ?? (1 - currentPrice));

    // Dynamic balance - starts at $10,000, updates from trade response
    const [balance, setBalance] = useState(10000.00);

    // User positions - shares held
    const [yesShares, setYesShares] = useState(0);
    const [noShares, setNoShares] = useState(0);

    // Fetch user positions on mount and after trades
    const fetchPositions = async () => {
        if (!market?.id) return;
        try {
            const res = await fetch(`/api/manifold/positions?contractId=${market.id}&userId=demo-user&t=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                setYesShares(data.yesShares ?? 0);
                setNoShares(data.noShares ?? 0);
            }
        } catch (e) {
            console.error('Failed to fetch positions', e);
        }
    };

    useEffect(() => {
        // Fetch positions when market loads or when switching to SELL tab
        if (market?.id) {
            fetchPositions();
        }
    }, [market?.id, tradeSide]);


    // Display Price
    const displayPrice = outcomeId === 'yes' ? yesPriceState : noPriceState;

    const handlePlaceOrder = async () => {
        if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
            alert("Please enter a valid amount");
            return;
        }

        // Check if this is a Manifold market (has mechanism field or pool field)
        // Manifold markets have: mechanism = 'cpmm-1' or pool = { YES, NO }
        const isManifoldMarket = market?.mechanism?.startsWith('cpmm') || market?.pool !== undefined;

        // Sandbox Checks
        if (isManifoldMarket && isLimit) {
            alert("Limit orders not supported in sandbox.");
            return;
        }

        const priceNum = parseFloat(limitPrice);
        const qtyNum = parseFloat(amount);

        // Validation for Limit
        if (!isManifoldMarket && isLimit && (isNaN(priceNum) || priceNum <= 0 || priceNum >= 1)) {
            alert("Please enter a valid limit price (0.01 - 0.99)");
            return;
        }

        // Determine Final Price to submit for CLOB
        const finalPrice = isLimit
            ? priceNum
            : (tradeSide === "BUY" ? 0.99 : 0.01);

        let endpoint = "";
        let payload: any = {};

        if (isManifoldMarket) {
            // Use new Manifold API
            if (tradeSide === "BUY") {
                endpoint = '/api/manifold/bet';
                payload = {
                    contractId: market.id,
                    amount: qtyNum,
                    outcome: outcomeId.toUpperCase(),
                    userId: "demo-user"
                };
            } else {
                endpoint = '/api/manifold/sell';
                payload = {
                    contractId: market.id,
                    shares: qtyNum,
                    outcome: outcomeId.toUpperCase(),
                    userId: "demo-user"
                };
            }
            console.log("Manifold Trade:", { endpoint, payload });
        } else {
            endpoint = `/api/markets/${market.id}/orders`;

            // CLOB Logic
            let shares = 0;
            if (tradeSide === "BUY") {
                let conversionPrice = 0;
                if (isLimit) {
                    conversionPrice = priceNum;
                } else {
                    conversionPrice = bestAsk || currentPrice || 0.5;
                    if (conversionPrice <= 0.01) conversionPrice = 0.5;
                }
                shares = qtyNum / conversionPrice;
            } else {
                shares = qtyNum;
            }

            payload = {
                userId: "demo-user",
                tab: tradeSide.toLowerCase(),
                outcome: outcomeId,
                price: finalPrice,
                qty: shares
            };
        }

        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const json = await res.json();

            if (!res.ok || json.error) {
                if (json.error === "INSUFFICIENT_SHARES" || json.error?.includes("No")) {
                    alert("Error: Insufficient shares to sell.");
                } else {
                    alert("Order failed: " + (json.error || "Unknown error"));
                }
                return;
            }

            // Success
            setAmount("");

            // Update prices from Manifold response
            if (json.probAfter !== undefined) {
                setYesPriceState(json.probAfter);
                setNoPriceState(1 - json.probAfter);
            } else if (json.currentProbability !== undefined) {
                setYesPriceState(json.currentProbability);
                setNoPriceState(1 - json.currentProbability);
            } else if (json.currentPrices) {
                setYesPriceState(json.currentPrices.probYes);
                setNoPriceState(json.currentPrices.probNo);
            }

            // Update balance from response
            if (json.newBalance !== undefined) {
                setBalance(json.newBalance);
            } else if (json.userCash !== undefined) {
                setBalance(json.userCash);
            }

            // Check for automatic redemption (netting out YES+NO)
            if (json.redemptionBets && json.redemptionBets.length > 0) {
                // Redemption creates bets with negative shares. We want the positive count of pairs.
                // Since it returns pairs (YES and NO), we can just take the first one's absolute value.
                const firstBet = json.redemptionBets[0];
                const redeemedPairs = Math.abs(firstBet.shares || 0);
                const cashReceived = redeemedPairs; // 1 pair (YES+NO) = $1 always

                alert(`✅ Redemption Success!\n\nBecause you held both YES and NO shares, we automatically converted ${redeemedPairs.toFixed(2)} overlapping pairs into $${cashReceived.toFixed(2)} cash.\n\nYour position has been netted out.`);
            }

            // Refresh positions after trade
            fetchPositions();

            if (onOrderPlaced) onOrderPlaced();

        } catch (e) {
            console.error("Order error", e);
            alert("Failed to place order");
        }
    };

    const setMax = () => {
        // Set amount to full balance for buy, or max shares for sell
        if (tradeSide === 'BUY') {
            setAmount(balance.toFixed(2));
        } else {
            // For sell, use the shares the user holds
            const maxShares = outcomeId === 'yes' ? yesShares : noShares;
            setAmount(maxShares.toFixed(2));
        }
    };

    return (
        <div className="flex flex-col h-full bg-[var(--bg-panel)] border-l border-[var(--border-subtle)]">
            {/* Header */}
            <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-panel-hover)]">
                <div className="flex items-center gap-2">
                    <TrendingUp size={16} className="text-[var(--color-primary)]" />
                    <span className="font-bold text-sm text-[var(--text-main)]">Trade</span>
                </div>
            </div>

            <div className="p-4 flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                {/* Buy / Sell Tabs */}
                <div className="flex p-1 bg-[var(--bg-input)] rounded-lg border border-[var(--border-subtle)]">
                    <button
                        className={clsx(
                            "flex-1 py-2 text-sm font-bold rounded transition-all",
                            tradeSide === "BUY"
                                ? "bg-[var(--color-success)] text-white shadow-sm"
                                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                        )}
                        onClick={() => { setTradeSide("BUY"); setAmount(""); }}
                    >
                        Buy
                    </button>
                    <button
                        className={clsx(
                            "flex-1 py-2 text-sm font-bold rounded transition-all",
                            tradeSide === "SELL"
                                ? "bg-[var(--color-danger)] text-white shadow-sm"
                                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                        )}
                        onClick={() => { setTradeSide("SELL"); setAmount(""); }}
                    >
                        Sell
                    </button>
                </div>

                {/* Outcome Toggles */}
                <div className="flex gap-2">
                    <button
                        className={clsx(
                            "flex-1 p-3 rounded-lg transition-all flex flex-col items-center justify-center gap-1 border",
                            outcomeId === "yes"
                                ? "bg-[var(--color-success)]/10 border-[var(--color-success)] shadow-sm"
                                : "bg-[var(--bg-input)] border-[var(--border-subtle)] hover:bg-[var(--bg-panel-hover)]"
                        )}
                        onClick={() => setOutcomeId("yes")}
                    >
                        <span className={clsx("text-xs font-bold", outcomeId === "yes" ? "text-[var(--color-success)]" : "text-[var(--text-muted)]")}>YES</span>
                        <span className="text-[10px] text-[var(--text-secondary)] mt-1">{(yesPriceState * 100).toFixed(2)}¢</span>
                        {tradeSide === "SELL" && (
                            <span className="text-[9px] text-gray-400">{yesShares.toFixed(1)} shares</span>
                        )}
                    </button>
                    <button
                        className={clsx(
                            "flex-1 p-3 rounded-lg transition-all flex flex-col items-center justify-center gap-1 border",
                            outcomeId === "no"
                                ? "bg-[var(--color-danger)]/10 border-[var(--color-danger)] shadow-sm"
                                : "bg-[var(--bg-input)] border-[var(--border-subtle)] hover:bg-[var(--bg-panel-hover)]"
                        )}
                        onClick={() => setOutcomeId("no")}
                    >
                        <span className={clsx("text-xs font-bold", outcomeId === "no" ? "text-[var(--color-danger)]" : "text-[var(--text-muted)]")}>NO</span>
                        <span className="text-[10px] text-[var(--text-secondary)] mt-1">{(noPriceState * 100).toFixed(2)}¢</span>
                        {tradeSide === "SELL" && (
                            <span className="text-[9px] text-gray-400">{noShares.toFixed(1)} shares</span>
                        )}
                    </button>
                </div>

                {/* Limit Order Checkbox */}
                {market?.phase !== "sandbox_curve" && (
                    <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={isLimit}
                            onChange={(e) => setIsLimit(e.target.checked)}
                            className="rounded border-[var(--border-subtle)] bg-[var(--bg-input)] text-[var(--color-primary)] focus:ring-0"
                        />
                        Limit Order
                    </label>
                )}

                {/* Limit Price Input */}
                {isLimit && (
                    <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex justify-between text-xs">
                            <span className="font-bold text-[var(--text-secondary)] uppercase">Price</span>
                        </div>
                        <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max="0.99"
                            className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg p-3 text-[var(--text-main)] font-mono placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--color-primary)] transition-all pl-3"
                            placeholder="0.50"
                            value={limitPrice}
                            onChange={(e) => setLimitPrice(e.target.value)}
                        />
                    </div>
                )}

                {/* Amount Input */}
                <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-xs">
                        <span className="font-bold text-[var(--text-secondary)] uppercase">
                            {tradeSide === "BUY" ? "Amount (USD)" : "Amount (Shares)"}
                        </span>
                        <div className="flex items-center gap-1 text-[var(--text-muted)]">
                            <Wallet size={10} />
                            <span>${balance.toFixed(2)}</span>
                        </div>
                    </div>
                    <div className="relative group">
                        {tradeSide === "BUY" && (
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--text-main)] transition-colors">$</span>
                        )}
                        <input
                            type="number"
                            className={clsx(
                                "w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg p-3 text-[var(--text-main)] font-mono placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--color-primary)] transition-all",
                                tradeSide === "BUY" ? "pl-7" : "pl-3"
                            )}
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                        <button onClick={setMax} className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-1 rounded">MAX</button>
                    </div>
                </div>

                {/* Submit Button */}
                {(() => {
                    const canSell = tradeSide === "SELL"
                        ? (outcomeId === "yes" ? yesShares > 0 : noShares > 0)
                        : true;
                    const isDisabled = tradeSide === "SELL" && !canSell;
                    return (
                        <button
                            className={clsx(
                                "w-full p-4 rounded-xl font-bold text-white shadow-lg transition-all transform",
                                isDisabled
                                    ? "bg-gray-300 cursor-not-allowed opacity-60"
                                    : tradeSide === "BUY"
                                        ? "bg-[var(--color-success)] hover:opacity-90 shadow-emerald-900/10 active:scale-[0.98]"
                                        : "bg-[var(--color-danger)] hover:opacity-90 shadow-red-900/10 active:scale-[0.98]"
                            )}
                            onClick={handlePlaceOrder}
                            disabled={isDisabled}
                        >
                            {isDisabled
                                ? `No ${outcomeId.toUpperCase()} shares to sell`
                                : `${tradeSide} ${outcomeId.toUpperCase()} ${isLimit && limitPrice ? "@ " + limitPrice : (isLimit ? "" : "@ MKT")}`
                            }
                        </button>
                    );
                })()}
            </div>

            <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-input)]">
                <div className="p-3 border-b border-[var(--border-subtle)] flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />
                    <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase">My Activity</h3>
                </div>
                <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                    <MyBets marketId={market.id} />
                </div>
            </div>
        </div>
    );
}
