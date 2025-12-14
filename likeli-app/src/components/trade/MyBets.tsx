"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { OutcomePosition } from "@/lib/orderbook";

interface MyBetsProps {
    marketId: string;
}

export default function MyBets({ marketId }: MyBetsProps) {
    const [positions, setPositions] = useState<OutcomePosition[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchPositions = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/markets/${marketId}/positions?userId=demo-user`);
            const data = await res.json();
            if (data.positions) {
                setPositions(data.positions);
            }
        } catch (e) {
            console.error("Failed to fetch positions", e);
        } finally {
            setLoading(false);
        }
    };

    // Poll for updates every 3 seconds for liveliness
    useEffect(() => {
        fetchPositions();
        const interval = setInterval(fetchPositions, 3000);
        return () => clearInterval(interval);
    }, [marketId]);

    if (loading && positions.length === 0) {
        return <div className="p-4 text-center text-muted text-xs">Loading requests...</div>;
    }

    if (positions.length === 0) {
        return <div className="p-4 text-center text-muted text-sm">No active bets.</div>;
    }

    return (
        <div className="flex-col gap-4 p-4">
            <div className="flex-col gap-2">
                {positions.map((pos, idx) => {
                    const marketName = pos.marketId; // Ideal would be to fetch market name, but ID is what we have on position
                    if (pos.qty <= 0.0001) return null;

                    const pnlPercent = 0; // Need current price to calc
                    // Simpler display: Shares @ Avg Price

                    return (
                        <div key={idx} className="p-3 bg-secondary rounded-lg border border-border text-sm mb-2">
                            <div className="flex-between mb-1">
                                <span className={clsx("font-bold", pos.outcome === "yes" ? "text-success" : "text-danger")}>
                                    {pos.outcome.toUpperCase()}
                                </span>
                            </div>
                            <div className="flex-between text-xs text-muted">
                                <span>{pos.qty.toFixed(2)} shares @ {pos.avgPrice.toFixed(2)}¢</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
