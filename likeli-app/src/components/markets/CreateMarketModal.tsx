"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { X, Plus, Trash2 } from "lucide-react";
import styles from "./markets.module.css";
import { MINIMUM_ANTE, MAX_ANSWERS } from "@/lib/graduation";

interface CreateMarketModalProps {
    onClose: () => void;
}

export default function CreateMarketModal({ onClose }: CreateMarketModalProps) {
    const { currentUser } = useStore();
    const router = useRouter();
    const { isAuthenticated } = useAuth();

    const [question, setQuestion] = useState("");
    const [category, setCategory] = useState("General");
    const [date, setDate] = useState("");
    const [liquidity, setLiquidity] = useState("100");
    const [rules, setRules] = useState("");

    // Multi-choice support
    const [outcomeType, setOutcomeType] = useState<"BINARY" | "MULTIPLE_CHOICE">("BINARY");
    const [answers, setAnswers] = useState<string[]>(["", ""]);
    // Dependent = probabilities must sum to 100%, Independent = each answer is separate
    const [shouldAnswersSumToOne, setShouldAnswersSumToOne] = useState(true);

    const addAnswer = () => {
        if (answers.length < MAX_ANSWERS) {
            setAnswers([...answers, ""]);
        }
    };

    const removeAnswer = (index: number) => {
        if (answers.length > 2) {
            setAnswers(answers.filter((_, i) => i !== index));
        }
    };

    const updateAnswer = (index: number, value: string) => {
        const newAnswers = [...answers];
        newAnswers[index] = value;
        setAnswers(newAnswers);
    };

    const handleSubmit = async () => {
        if (!question || !date) {
            alert("Please fill all required fields");
            return;
        }

        const liqNum = parseFloat(liquidity);
        if (liqNum < MINIMUM_ANTE) {
            alert(`Minimum liquidity is $${MINIMUM_ANTE}`);
            return;
        }

        // Validate multi-choice answers
        if (outcomeType === "MULTIPLE_CHOICE") {
            const validAnswers = answers.filter(a => a.trim().length > 0);
            if (validAnswers.length < 2) {
                alert("Please provide at least 2 answers for multi-choice markets");
                return;
            }
        }

        try {
            const body: any = {
                question,
                category,
                closeTime: new Date(date).getTime(),
                ante: liqNum,
                rules,
                outcomeType,
                userId: currentUser?.id || "demo-user"
            };

            if (outcomeType === "MULTIPLE_CHOICE") {
                body.answers = answers.filter(a => a.trim().length > 0);
                body.shouldAnswersSumToOne = shouldAnswersSumToOne;
            }

            const res = await fetch("/api/manifold/markets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            const result = await res.json();

            if (res.ok && result.success) {
                onClose();
                router.push(`/market/${result.market.id}`);
            } else {
                alert(result.error || "Failed to create market");
            }
        } catch (e) {
            console.error(e);
            alert("Error creating market");
        }
    };

    const totalCost = parseFloat(liquidity || "0") + 50;
    const canAfford = currentUser?.balance >= totalCost && isAuthenticated;

    return (
        <div className={styles.backdrop}>
            <div className={styles.modalCard}>
                {/* Header */}
                <div className={styles.header}>
                    <div>
                        <h2 className={styles.title}>Create Sandbox Market</h2>
                        <p className={styles.subtitle}>Launch a new market. Reach $500 volume to graduate to main!</p>
                    </div>
                    <button onClick={onClose} className={styles.close}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.content}>
                    {/* Left Column: Form Fields */}
                    <div className={styles.left}>
                        {/* Market Type Toggle */}
                        <div className={styles.field}>
                            <label className={styles.label}>Market Type</label>
                            <div className={styles.typeToggle}>
                                <button
                                    type="button"
                                    className={`${styles.typeBtn} ${outcomeType === "BINARY" ? styles.typeBtnActive : ""}`}
                                    onClick={() => setOutcomeType("BINARY")}
                                >
                                    Yes / No
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.typeBtn} ${outcomeType === "MULTIPLE_CHOICE" ? styles.typeBtnActive : ""}`}
                                    onClick={() => setOutcomeType("MULTIPLE_CHOICE")}
                                >
                                    Multiple Choice
                                </button>
                            </div>
                        </div>

                        {/* Question Input */}
                        <div className={styles.field}>
                            <label className={styles.label}>Market Question</label>
                            <input
                                className={styles.input}
                                placeholder={outcomeType === "BINARY"
                                    ? "e.g. Will Bitcoin hit $100k by 2025?"
                                    : "e.g. Who will win the 2024 election?"
                                }
                                value={question}
                                onChange={e => setQuestion(e.target.value)}
                                autoFocus
                            />
                        </div>

                        {/* Multi-choice Answers */}
                        {outcomeType === "MULTIPLE_CHOICE" && (
                            <div className={styles.field}>
                                <label className={styles.label}>Answers ({answers.length}/{MAX_ANSWERS})</label>
                                <div className={styles.answersContainer}>
                                    {answers.map((answer, index) => (
                                        <div key={index} className={styles.answerRow}>
                                            <input
                                                className={styles.input}
                                                placeholder={`Answer ${index + 1}`}
                                                value={answer}
                                                onChange={e => updateAnswer(index, e.target.value)}
                                            />
                                            {answers.length > 2 && (
                                                <button
                                                    type="button"
                                                    className={styles.removeAnswerBtn}
                                                    onClick={() => removeAnswer(index)}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {answers.length < MAX_ANSWERS && (
                                        <button
                                            type="button"
                                            className={styles.addAnswerBtn}
                                            onClick={addAnswer}
                                        >
                                            <Plus size={14} /> Add Answer
                                        </button>
                                    )}
                                </div>

                                {/* Dependent/Independent Toggle */}
                                <div style={{ marginTop: '12px' }}>
                                    <label className={styles.label}>Probability Mode</label>
                                    <div className={styles.typeToggle}>
                                        <button
                                            type="button"
                                            className={`${styles.typeBtn} ${shouldAnswersSumToOne ? styles.typeBtnActive : ""}`}
                                            onClick={() => setShouldAnswersSumToOne(true)}
                                        >
                                            Dependent (Sum to 100%)
                                        </button>
                                        <button
                                            type="button"
                                            className={`${styles.typeBtn} ${!shouldAnswersSumToOne ? styles.typeBtnActive : ""}`}
                                            onClick={() => setShouldAnswersSumToOne(false)}
                                        >
                                            Independent
                                        </button>
                                    </div>
                                    <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px' }}>
                                        {shouldAnswersSumToOne
                                            ? "Probabilities will always sum to 100%. Buying YES on one answer automatically lowers others."
                                            : "Each answer has its own independent probability. Good for non-exclusive outcomes."
                                        }
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Category */}
                            <div className={styles.field}>
                                <label className={styles.label}>Category</label>
                                <select
                                    className={styles.select}
                                    value={category}
                                    onChange={e => setCategory(e.target.value)}
                                >
                                    <option>General</option>
                                    <option>Crypto</option>
                                    <option>Politics</option>
                                    <option>Sports</option>
                                    <option>Tech</option>
                                    <option>Culture</option>
                                </select>
                            </div>

                            {/* Date */}
                            <div className={styles.field}>
                                <label className={styles.label}>Resolution Date</label>
                                <input
                                    type="date"
                                    className={styles.input}
                                    value={date}
                                    onChange={e => setDate(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Rules */}
                        <div className={styles.field}>
                            <label className={styles.label}>Resolution Rules (optional)</label>
                            <textarea
                                className={`${styles.input} min-h-[80px]`}
                                placeholder="Define exact resolution conditions..."
                                value={rules}
                                onChange={e => setRules(e.target.value)}
                            />
                        </div>

                        {/* Liquidity Section */}
                        <div className={styles.field}>
                            <div className="flex justify-between">
                                <label className={styles.label}>Initial Liquidity</label>
                                <span className="text-xs text-gray-400">Min: ${MINIMUM_ANTE}</span>
                            </div>
                            <input
                                type="number"
                                className={styles.input}
                                value={liquidity}
                                onChange={e => setLiquidity(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Right Column: Summary & Actions */}
                    <div className={styles.right}>
                        <div className={styles.summaryBox}>
                            <div className={styles.summaryContent}>
                                <h3 className={styles.label} style={{ marginBottom: "16px" }}>Cost Summary</h3>

                                <div className={styles.summaryRow}>
                                    <span>Market Type</span>
                                    <span className="font-mono">{outcomeType === "BINARY" ? "Yes/No" : `${answers.filter(a => a.trim()).length} Choices`}</span>
                                </div>
                                <div className={styles.summaryRow}>
                                    <span>Liquidity Deposit</span>
                                    <span className="font-mono">${parseFloat(liquidity || "0").toFixed(2)}</span>
                                </div>
                                <div className={styles.summaryRow}>
                                    <span>Creation Fee</span>
                                    <span className="font-mono">$50.00</span>
                                </div>

                                <div className={styles.summaryTotal}>
                                    <span>Total Cost</span>
                                    <span style={{ color: canAfford ? "inherit" : "#ef4444" }}>
                                        ${totalCost.toFixed(2)}
                                    </span>
                                </div>

                                <div className={styles.graduationNote}>
                                    💡 Reach $500 volume to graduate to main markets!
                                </div>
                            </div>

                            <div className={styles.actions}>
                                <button
                                    className={`${styles.btn} ${styles.btnOutline}`}
                                    onClick={onClose}
                                >
                                    Cancel
                                </button>
                                <button
                                    className={`${styles.btn} ${styles.btnPrimary}`}
                                    disabled={!canAfford || !question || !date}
                                    onClick={handleSubmit}
                                >
                                    {!isAuthenticated ? "Connect Wallet" : canAfford ? "Create Market" : "Insufficient Balance"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
