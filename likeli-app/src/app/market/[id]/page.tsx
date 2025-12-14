"use client";

import { useEffect, useState } from "react";
import ChartContainer from "@/components/trade/ChartContainer";
import MultiOutcomeChart from "@/components/market/MultiOutcomeChart";
import TradePanel from "@/components/trade/TradePanel";
import MultiChoiceAnswerList from "@/components/trade/MultiChoiceAnswerList";
import styles from "@/components/trade/trade.module.css";
import { useParams } from "next/navigation";
import OrderBook from "@/components/trade/OrderBook";
import { MarketOrderbook, PricePoint } from "@/lib/orderbook";

export default function MarketPage() {
    const params = useParams();
    const id = params?.id as string;
    const mode = "simple";

    const [orderbook, setOrderbook] = useState<MarketOrderbook | null>(null);
    const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [marketDataFull, setMarketDataFull] = useState<any>(null);

    const fetchData = async () => {
        try {
            // Check if it's a sandbox/manifold market (starts with sb_)
            if (id.startsWith("sb_")) {
                // Use new Manifold API
                const res = await fetch(`/api/manifold/markets/${id}`);
                if (!res.ok) return;
                const marketData = await res.json();

                const prob = marketData.probability || 0.5;

                setOrderbook({
                    marketId: marketData.id,
                    yes: { bids: [], asks: [], bestAsk: prob, bestBid: prob },
                    no: { bids: [], asks: [], bestAsk: 1 - prob, bestBid: 1 - prob },
                    probability: prob * 100,
                    lastTradePrice: prob
                } as any);

                if (marketData.priceHistory) {
                    setPriceHistory(marketData.priceHistory);
                }

                setMarketDataFull(marketData);
            } else {
                // Regular orderbook market
                const obRes = await fetch(`/api/markets/${id}/orderbook`);
                const obData = await obRes.json();
                if (obData) setOrderbook(obData);

                const histRes = await fetch(`/api/markets/${id}/price-history`);
                const histData = await histRes.json();
                if (histData.points) setPriceHistory(histData.points);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) fetchData();
    }, [id, refreshTrigger]);

    // Auto-refresh every 5s
    useEffect(() => {
        const i = setInterval(() => setRefreshTrigger(n => n + 1), 5000);
        return () => clearInterval(i);
    }, []);

    const handleOrderPlaced = () => {
        setRefreshTrigger(n => n + 1);
        fetchData();
    };

    if (loading) return <div className="p-10 text-center">Loading market data...</div>;

    // Market metadata
    const marketMeta = marketDataFull || {
        question: "Will this event happen?",
        category: "Tech",
        resolutionDate: "Dec 31, 2024",
        status: "OPEN"
    };

    // Check if multi-choice market
    const isMultiChoice = marketDataFull?.outcomeType === 'MULTIPLE_CHOICE' && marketDataFull?.answers?.length > 0;
    const isSandbox = id.startsWith("sb_");

    // Extract Data
    const bids = orderbook?.yes.bids.map(b => ({ price: b.price, size: b.qty })) || [];
    const asks = orderbook?.yes.asks.map(a => ({ price: a.price, size: a.qty })) || [];

    // Probability / Prices
    const probability = orderbook?.probability || 50;
    const yesPrice = probability / 100;
    const bestAsk = orderbook?.yes.bestAsk;

    return (
        <div className={styles.container}>
            <div className={styles.leftColumn}>
                <div className={styles.header}>
                    <div>
                        <h1 className={styles.title}>{marketMeta.question}</h1>
                        <div className={styles.tags}>
                            <span className={styles.tag}>{marketMeta.category || 'General'}</span>
                            <span className={styles.tag}>{marketMeta.closeTime ? new Date(marketMeta.closeTime).toLocaleDateString() : 'No close date'}</span>
                            <span className={styles.tag} style={{ color: "var(--color-success)", borderColor: "var(--color-success)" }}>
                                {marketMeta.resolution || "OPEN"}
                            </span>
                            {isSandbox && (
                                <span className={styles.tag} style={{ color: "#3b82f6", borderColor: "#3b82f6" }}>
                                    Sandbox
                                </span>
                            )}
                            {isMultiChoice && (
                                <span className={styles.tag} style={{ color: "#f59e0b", borderColor: "#f59e0b" }}>
                                    {marketDataFull.answers.length} Choices
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* For multi-choice, show chart + answer list in left column */}
                {isMultiChoice ? (
                    <>
                        <MultiOutcomeChart
                            answers={marketDataFull.answers}
                            volume={marketDataFull.volume || 0}
                            priceHistory={marketDataFull.answerPriceHistory}
                        />
                        <MultiChoiceAnswerList
                            marketId={id}
                            answers={marketDataFull.answers}
                            onTrade={handleOrderPlaced}
                        />
                    </>
                ) : (
                    <ChartContainer
                        mode={mode}
                        setMode={() => { }}
                        priceHistory={priceHistory}
                    />
                )}
            </div>

            <div className={styles.rightColumn}>
                {/* For multi-choice, show info panel instead of trade panel */}
                {isMultiChoice ? (
                    <div className={styles.tradePanel}>
                        <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>
                            How to Trade
                        </h3>
                        <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                            <strong>YES</strong>: Buy if you think this answer will win.<br />
                            <strong>NO</strong>: Buy if you think this answer will lose.
                        </p>
                        <div style={{
                            marginTop: "16px",
                            padding: "12px",
                            background: "var(--bg-input)",
                            borderRadius: "8px",
                            fontSize: "12px",
                            color: "var(--text-muted)"
                        }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                <span>Total Volume</span>
                                <span style={{ color: "var(--text-main)" }}>${marketDataFull.volume?.toFixed(2) || "0.00"}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                <span>Liquidity</span>
                                <span style={{ color: "var(--text-main)" }}>${marketDataFull.totalLiquidity?.toFixed(2) || "0.00"}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span>Answers</span>
                                <span style={{ color: "var(--text-main)" }}>{marketDataFull.answers?.length || 0}</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <TradePanel
                        mode={mode}
                        market={marketDataFull || { id: id, question: marketMeta.question, status: "open" } as any}
                        onOrderPlaced={handleOrderPlaced}
                        currentPrice={yesPrice}
                        bestAsk={bestAsk}
                    />
                )}

                {!isSandbox && !isMultiChoice && (
                    <OrderBook
                        bids={bids}
                        asks={asks}
                        lastTrade={undefined}
                    />
                )}

                {isSandbox && !isMultiChoice && (
                    <div className="p-4 bg-[var(--bg-panel)] rounded-xl border border-[var(--border-subtle)] text-center text-sm text-[var(--text-secondary)]">
                        <p>Sandbox Market – trading via CPMM (no orderbook).</p>
                    </div>
                )}
            </div>
        </div>
    );
}
