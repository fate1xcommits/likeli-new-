"use client";

import { useEffect, useState } from "react";
import ChartContainer from "@/components/trade/ChartContainer";
import MultiOutcomeChart from "@/components/market/MultiOutcomeChart";
import OracleStatus from "@/components/market/OracleStatus";
import TradePanel from "@/components/trade/TradePanel";
import MultiChoiceAnswerList from "@/components/trade/MultiChoiceAnswerList";
import MyBets from "@/components/trade/MyBets";
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
    const [selectedOutcome, setSelectedOutcome] = useState<'yes' | 'no'>('yes');

    const fetchData = async () => {
        try {
            // Check if it's a sandbox/manifold market (starts with sb_)
            if (id.startsWith("sb_")) {
                // Use new Manifold API
                const res = await fetch(`/api/manifold/markets/${id}`);
                if (!res.ok) return;
                const marketData = await res.json();

                const prob = marketData.probability || 0.5;

                // Fetch orderbook for main markets (both binary and multi-choice)
                if (marketData.phase === 'main') {
                    const obRes = await fetch(`/api/manifold/limit-order?contractId=${id}`);
                    if (obRes.ok) {
                        const obJson = await obRes.json();
                        const ob = obJson.orderbook;
                        setOrderbook({
                            marketId: marketData.id,
                            yes: ob?.yes ?? { bids: [], asks: [], bestAsk: prob, bestBid: prob },
                            no: ob?.no ?? { bids: [], asks: [], bestAsk: 1 - prob, bestBid: 1 - prob },
                            probability: prob * 100,
                            lastTradePrice: prob
                        } as any);
                    } else {
                        setOrderbook({
                            marketId: marketData.id,
                            yes: { bids: [], asks: [], bestAsk: prob, bestBid: prob },
                            no: { bids: [], asks: [], bestAsk: 1 - prob, bestBid: 1 - prob },
                            probability: prob * 100,
                            lastTradePrice: prob
                        } as any);
                    }
                } else {
                    setOrderbook({
                        marketId: marketData.id,
                        yes: { bids: [], asks: [], bestAsk: prob, bestBid: prob },
                        no: { bids: [], asks: [], bestAsk: 1 - prob, bestBid: 1 - prob },
                        probability: prob * 100,
                        lastTradePrice: prob
                    } as any);
                }

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

    // Oracle handlers
    const handleOraclePropose = async () => {
        try {
            const res = await fetch('/api/oracle/propose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contractId: id })
            });
            const data = await res.json();
            if (data.success) {
                alert(`Proposal: ${data.proposal.resolution}\n${data.proposal.reasoning}`);
                fetchData();
            } else {
                alert(`Error: ${data.error}`);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleOracleChallenge = async (reason: string) => {
        try {
            const res = await fetch('/api/oracle/challenge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contractId: id, challengerId: 'demo-user', reason })
            });
            const data = await res.json();
            if (data.success) {
                alert('Challenge submitted!');
                fetchData();
            } else {
                alert(`Error: ${data.error}`);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleOracleFinalize = async () => {
        try {
            const res = await fetch('/api/oracle/finalize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contractId: id })
            });
            const data = await res.json();
            if (data.success) {
                alert(`Finalized as ${data.resolution}! ${data.payoutsCount} users paid.`);
                fetchData();
            } else {
                alert(`Error: ${data.error}`);
            }
        } catch (e) {
            console.error(e);
        }
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
    const marketPhase = marketDataFull?.phase;
    const isSandbox = marketPhase ? marketPhase !== 'main' : id.startsWith("sb_");

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
                            phase={marketDataFull?.phase}
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
                {/* Oracle Status - Show for sandbox markets with resolution source */}
                {isSandbox && marketDataFull?.resolutionSource && (
                    <OracleStatus
                        contractId={id}
                        oracleStatus={marketDataFull.oracleStatus}
                        proposal={marketDataFull.oracleProposal}
                        challenge={marketDataFull.oracleChallenge}
                        resolutionSource={marketDataFull.resolutionSource}
                        currentUserId="demo-user"
                        onPropose={handleOraclePropose}
                        onChallenge={handleOracleChallenge}
                        onFinalize={handleOracleFinalize}
                    />
                )}

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

                        {/* My Activity Section for Multi-Choice */}
                        <div style={{ marginTop: "16px", borderTop: "1px solid var(--border-subtle)", paddingTop: "16px" }}>
                            <h3 style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: "8px" }}>
                                My Activity
                            </h3>
                            <div style={{ maxHeight: "150px", overflowY: "auto" }}>
                                <MyBets marketId={id} isManifold={isSandbox} />
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
                        onOutcomeChange={(outcome: 'yes' | 'no') => setSelectedOutcome(outcome)}
                    />
                )}

                {/* Show OrderBook for main binary markets only - multi-choice has per-answer orderbook */}
                {marketPhase === 'main' && !isMultiChoice && (
                    <OrderBook
                        bids={bids}
                        asks={asks}
                        lastTrade={undefined}
                        selectedOutcome={selectedOutcome}
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
