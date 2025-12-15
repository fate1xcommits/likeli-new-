"use client";

import { useState } from "react";
import styles from "./trade.module.css";
import { useStore } from "@/lib/store";
import { useAuth } from "@/context/AuthContext";

interface AnswerData {
    id: string;
    text: string;
    poolYes: number;
    poolNo: number;
    prob: number;
    volume: number;
    index: number;
}

interface MultiChoiceAnswerListProps {
    marketId: string;
    answers: AnswerData[];
    onTrade?: () => void;
}

export default function MultiChoiceAnswerList({
    marketId,
    answers,
    onTrade
}: MultiChoiceAnswerListProps) {
    const [expandedAnswer, setExpandedAnswer] = useState<string | null>(null);
    const [selectedOutcome, setSelectedOutcome] = useState<'YES' | 'NO'>('YES');
    const [loading, setLoading] = useState<string | null>(null);
    const [amount, setAmount] = useState("10");
    const { currentUser } = useStore();
    const { isAuthenticated } = useAuth();

    const handleTrade = async (answerId: string, outcome: 'YES' | 'NO') => {
        if (!isAuthenticated) {
            alert("Please connect your wallet first");
            return;
        }

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            alert("Enter a valid amount");
            return;
        }

        if ((currentUser?.balance || 0) < amountNum) {
            alert("Insufficient balance");
            return;
        }

        setLoading(answerId);

        try {
            const payload = {
                contractId: marketId,
                answerId,
                amount: amountNum,
                outcome,
                userId: currentUser?.id || "demo-user"
            };

            // DEBUG: Log request payload
            console.log('[MultiChoice Trade Request]', payload);
            console.log('[MultiChoice] answerId:', answerId, 'outcome:', outcome, 'amount:', amountNum);

            const res = await fetch('/api/manifold/bet', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            // DEBUG: Log response including all answer probabilities
            console.log('[Trade Response]', data);
            if (data.allAnswerProbs) {
                console.log('[All Answer Probs after trade]:', data.allAnswerProbs);
                const probSum = data.allAnswerProbs.reduce((s: number, a: any) => s + a.prob, 0);
                console.log('[Probability Sum]:', probSum, '%');
            }

            if (res.ok && data.success) {
                onTrade?.();
                setExpandedAnswer(null);
            } else {
                alert(data.error || "Trade failed");
            }
        } catch (e) {
            console.error(e);
            alert("Trade error");
        } finally {
            setLoading(null);
        }
    };

    // Sort answers by probability (highest first)
    const sortedAnswers = [...answers].sort((a, b) => b.prob - a.prob);

    return (
        <div className={styles.multiChoiceContainer}>
            <div className={styles.multiChoiceHeader}>
                <span>Answer</span>
                <span>Chance</span>
                <span>Trade</span>
            </div>

            <div className={styles.answerList}>
                {sortedAnswers.map((answer) => {
                    const prob = Math.round(answer.prob * 100);
                    const isExpanded = expandedAnswer === answer.id;
                    const isLoading = loading === answer.id;

                    return (
                        <div key={answer.id} className={styles.answerItem}>
                            <div className={styles.answerMain}>
                                {/* Probability bar background */}
                                <div
                                    className={styles.answerProbBar}
                                    style={{ width: `${prob}%` }}
                                />

                                {/* Rank & Text */}
                                <div className={styles.answerInfo}>
                                    <span className={styles.answerRank}>{prob}%</span>
                                    <span className={styles.answerText}>{answer.text}</span>
                                </div>

                                {/* Trade Buttons - Both YES and NO */}
                                <div className={styles.answerActions}>
                                    <button
                                        className={`${styles.answerBtn} ${styles.answerBtnYes}`}
                                        onClick={() => {
                                            setExpandedAnswer(isExpanded && selectedOutcome === 'YES' ? null : answer.id);
                                            setSelectedOutcome('YES');
                                        }}
                                        disabled={isLoading}
                                    >
                                        Yes
                                    </button>
                                    <button
                                        className={`${styles.answerBtn} ${styles.answerBtnNo}`}
                                        onClick={() => {
                                            setExpandedAnswer(isExpanded && selectedOutcome === 'NO' ? null : answer.id);
                                            setSelectedOutcome('NO');
                                        }}
                                        disabled={isLoading}
                                    >
                                        No
                                    </button>
                                </div>
                            </div>

                            {/* Expanded Trade Panel */}
                            {isExpanded && (
                                <div className={styles.answerTradePanel}>
                                    <div className={styles.answerTradeRow}>
                                        <span style={{
                                            color: selectedOutcome === 'YES' ? 'var(--color-success)' : 'var(--color-danger)',
                                            fontWeight: 600,
                                            fontSize: '14px'
                                        }}>
                                            Buy {selectedOutcome} on "{answer.text}"
                                        </span>
                                    </div>
                                    <div className={styles.answerTradeRow}>
                                        <label>Amount ($)</label>
                                        <input
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            className={styles.answerInput}
                                            min="1"
                                        />
                                    </div>
                                    <div className={styles.answerTradeRow}>
                                        <span className={styles.answerEstimate}>
                                            {selectedOutcome === 'YES'
                                                ? `Est. payout: $${(parseFloat(amount || "0") / answer.prob).toFixed(2)} if ${answer.text} wins`
                                                : `Est. payout: $${(parseFloat(amount || "0") / (1 - answer.prob)).toFixed(2)} if ${answer.text} loses`
                                            }
                                        </span>
                                    </div>
                                    <div className={styles.answerTradeActions}>
                                        <button
                                            className={`${styles.answerTradeBtn} ${selectedOutcome === 'YES' ? styles.answerTradeBtnYes : styles.answerTradeBtnNo
                                                }`}
                                            style={{
                                                background: selectedOutcome === 'YES' ? 'var(--color-success)' : 'var(--color-danger)'
                                            }}
                                            onClick={() => handleTrade(answer.id, selectedOutcome)}
                                            disabled={isLoading || !isAuthenticated}
                                        >
                                            {isLoading
                                                ? "Buying..."
                                                : `Buy ${selectedOutcome} @ ${selectedOutcome === 'YES' ? prob : 100 - prob}¢`
                                            }
                                        </button>
                                        <button
                                            className={styles.answerTradeBtn}
                                            style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
                                            onClick={() => setExpandedAnswer(null)}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {answers.length > 10 && (
                <button className={styles.showMoreBtn}>
                    Show {answers.length - 10} more answers
                </button>
            )}
        </div>
    );
}
