"use client";

import { useState, useEffect } from "react";
import styles from "./markets.module.css";
import clsx from "clsx";
import Link from "next/link";
import { Clock, Users, TrendingUp } from "lucide-react";
import { GRADUATION_VOLUME_THRESHOLD, GRADUATION_TIMER_MS, formatTimeRemaining } from "@/lib/graduation";

interface MarketCardProps {
    id: string | number;
    name: string;
    category: string;
    yes: number;
    no: number;
    vol: string;
    end?: string;
    image?: string;
    phase?: string;
    volume?: number;
    graduationStartTime?: number;
    isMultiChoice?: boolean;
    answerCount?: number;
}

export default function MarketCard({
    id,
    name,
    category,
    yes,
    no,
    vol,
    end,
    image,
    phase,
    volume = 0,
    graduationStartTime,
    isMultiChoice,
    answerCount
}: MarketCardProps) {
    const prob = (yes * 100).toFixed(0);
    const [timeRemaining, setTimeRemaining] = useState<string | null>(null);

    // Calculate volume progress toward graduation
    const volumeProgress = Math.min(100, (volume / GRADUATION_VOLUME_THRESHOLD) * 100);

    // Update graduation timer countdown
    useEffect(() => {
        if (phase === "graduating" && graduationStartTime) {
            const updateTime = () => {
                const elapsed = Date.now() - graduationStartTime;
                const remaining = Math.max(0, GRADUATION_TIMER_MS - elapsed);
                setTimeRemaining(formatTimeRemaining(remaining));
            };

            updateTime();
            const interval = setInterval(updateTime, 1000);
            return () => clearInterval(interval);
        }
    }, [phase, graduationStartTime]);

    return (
        <Link href={`/market/${id}`} className={styles.marketCard}>
            <div className={styles.cardHeader}>
                <div className={styles.cardImagePlaceholder} />
                <div className={styles.cardCategory}>
                    {category}
                    {isMultiChoice && (
                        <span className={styles.multiChoiceBadge}>
                            <Users size={10} /> {answerCount}
                        </span>
                    )}
                </div>

                {/* Phase badge */}
                {phase && (
                    <div className={clsx(
                        styles.phaseBadge,
                        phase === "sandbox" && styles.phaseBadgeSandbox,
                        phase === "graduating" && styles.phaseBadgeGraduating,
                        phase === "main" && styles.phaseBadgeMain
                    )}>
                        {phase === "sandbox" && "Sandbox"}
                        {phase === "graduating" && (
                            <>
                                <Clock size={10} />
                                {timeRemaining}
                            </>
                        )}
                        {phase === "main" && "Main"}
                    </div>
                )}
            </div>

            <div className={styles.cardBody}>
                <h3 className={styles.cardTitle}>{name}</h3>

                <div className={styles.cardStats}>
                    <div className={styles.cardStat}>
                        <span className={styles.cardStatLabel}>{isMultiChoice ? "Top" : "Yes"}</span>
                        <span className={clsx(styles.cardStatValue, "text-success")}>{yes.toFixed(2)}¢</span>
                    </div>
                    <div className={styles.cardStat}>
                        <span className={styles.cardStatLabel}>{isMultiChoice ? "#2" : "No"}</span>
                        <span className={clsx(styles.cardStatValue, "text-danger")}>{no.toFixed(2)}¢</span>
                    </div>
                </div>

                <div className={styles.cardProbBar}>
                    <div
                        className={styles.probFill}
                        style={{ width: `${prob}%` }}
                    />
                </div>

                {/* Graduation progress (only for sandbox phase) */}
                {phase === "sandbox" && (
                    <div className={styles.graduationProgress}>
                        <div className={styles.graduationProgressBar}>
                            <div
                                className={styles.graduationProgressFill}
                                style={{ width: `${volumeProgress}%` }}
                            />
                        </div>
                        <span className={styles.graduationProgressText}>
                            <TrendingUp size={10} />
                            ${volume.toFixed(0)} / ${GRADUATION_VOLUME_THRESHOLD}
                        </span>
                    </div>
                )}

                <div className="flex-between" style={{ marginTop: "var(--space-2)" }}>
                    <span className={styles.cardProb}>{prob}% Chance</span>
                    <span className={styles.cardVol}>{vol} Vol</span>
                </div>
            </div>
        </Link>
    );
}
