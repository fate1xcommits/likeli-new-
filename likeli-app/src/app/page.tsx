"use client";

import { useState, useEffect, useCallback } from "react";
import StatsStrip from "@/components/markets/StatsStrip";
import MarketsGrid from "@/components/markets/MarketsGrid";
import { useStore } from "@/lib/store";
import CreateMarketModal from "@/components/markets/CreateMarketModal";
import { useParlay } from "@/context/ParlayContext";
import styles from "./page.module.css";
import { Search, Clock, TrendingUp, Sparkles, Trophy, Layers } from "lucide-react";
import clsx from "clsx";

const CATEGORIES = ["All", "Crypto", "Macro", "Politics", "Sports", "Culture"];

// Tab types for the market lifecycle
type MarketTab = "sandbox" | "graduating" | "main";

export default function Home() {
  const { markets } = useStore();
  const { toggleOpen: toggleParlaySlip, legs } = useParlay();
  const [activeTab, setActiveTab] = useState<MarketTab>("sandbox");
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Sandbox/Graduating Markets State
  const [allSandboxMarkets, setAllSandboxMarkets] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch all sandbox markets and filter by phase
  const fetchMarkets = useCallback(async () => {
    try {
      // Use the new Manifold API
      const res = await fetch("/api/manifold/markets");
      const data = await res.json();

      // Handle the new API response format: { markets: [...] }
      const marketsArray = data.markets || data || [];

      if (Array.isArray(marketsArray)) {
        const mapped = marketsArray.map((m: any) => {
          // For Manifold markets, probability is in m.p
          const prob = m.p ?? 0.5;

          return {
            id: m.id,
            question: m.question,
            category: m.category || "General",
            resolutionDate: m.closeTime,
            volume: m.volume || 0,
            outcomes: m.outcomeType === 'MULTIPLE_CHOICE' && m.answers
              ? m.answers.map((a: any) => ({
                id: a.id,
                name: a.text,
                price: a.prob
              }))
              : [
                { id: "yes", name: "Yes", price: prob },
                { id: "no", name: "No", price: 1 - prob }
              ],
            phase: m.phase || (m.resolution ? 'resolved' : 'sandbox'),  // Use actual phase from API
            outcomeType: m.outcomeType,
            graduationStartTime: m.graduationStartTime,
            image: "/placeholder-icon.png",
            // Include these for TradePanel to detect Manifold markets
            mechanism: m.mechanism,
            pool: m.pool
          };
        });
        setAllSandboxMarkets(mapped);
      }
    } catch (err) {
      console.error("Failed to fetch markets:", err);
    }
  }, []);

  // Fetch on mount and when tab changes
  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets, activeTab]);

  // Auto-refresh markets (check every 5 seconds to catch graduation state changes)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMarkets();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  // Filter markets by tab
  const getVisibleMarkets = () => {
    let sourceMarkets: any[];

    if (activeTab === "main") {
      // Main markets come from store (graduated) + sandbox markets with phase="main"
      const graduatedSandbox = allSandboxMarkets.filter(m => m.phase === "main");
      sourceMarkets = [...markets, ...graduatedSandbox];
    } else if (activeTab === "graduating") {
      sourceMarkets = allSandboxMarkets.filter(m => m.phase === "graduating");
    } else {
      // Sandbox tab shows sandbox phase markets
      sourceMarkets = allSandboxMarkets.filter(m => m.phase === "sandbox");
    }

    // Apply category and search filters
    return sourceMarkets.filter(m => {
      const matchesCategory = activeCategory === "All" || m.category === activeCategory;
      const matchesSearch = m.question.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  };

  const visibleMarkets = getVisibleMarkets();

  // Count markets in each phase
  const sandboxCount = allSandboxMarkets.filter(m => m.phase === "sandbox").length;
  const graduatingCount = allSandboxMarkets.filter(m => m.phase === "graduating").length;
  const mainCount = markets.length + allSandboxMarkets.filter(m => m.phase === "main").length;

  return (
    <div className="flex-col" style={{ gap: "var(--space-6)" }}>
      <StatsStrip />

      <div className={styles.controlsRow}>
        <div className={styles.controlsLeft}>
          {/* Tabs with counts */}
          <div className={styles.tabGroup}>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === "sandbox" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("sandbox")}
            >
              <Sparkles size={14} />
              Sandbox
              {sandboxCount > 0 && <span className={styles.tabBadge}>{sandboxCount}</span>}
            </button>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === "graduating" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("graduating")}
            >
              <TrendingUp size={14} />
              Graduating
              {graduatingCount > 0 && (
                <span className={`${styles.tabBadge} ${styles.tabBadgeGraduating}`}>
                  {graduatingCount}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`${styles.tab} ${activeTab === "main" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("main")}
            >
              <Trophy size={14} />
              Main Markets
              {mainCount > 0 && <span className={styles.tabBadge}>{mainCount}</span>}
            </button>
          </div>

          {/* Search */}
          <div className={styles.searchBar}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search markets..."
              className={styles.searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Filters */}
          <div className={styles.filters}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={clsx(styles.filterPill, activeCategory === cat && styles.filterPillActive)}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Header Actions */}
        <div className={styles.headerActions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={toggleParlaySlip}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Layers size={14} />
            Parlay{legs.length > 0 ? ` (${legs.length})` : ''}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => setIsCreateOpen(true)}
          >
            Create Market
          </button>
        </div>
      </div>

      {/* Tab description */}
      <div className={styles.tabDescription}>
        {activeTab === "sandbox" && (
          <p>
            <Sparkles size={14} /> New markets start here. Trade to reach $1,000 volume for graduation.
          </p>
        )}
        {activeTab === "graduating" && (
          <p>
            <Clock size={14} /> Markets that reached volume threshold. Graduating to main in 5 minutes.
          </p>
        )}
        {activeTab === "main" && (
          <p>
            <Trophy size={14} /> Fully graduated markets with proven liquidity and volume.
          </p>
        )}
      </div>

      <MarketsGrid markets={visibleMarkets} showGraduationProgress={activeTab === "sandbox" || activeTab === "graduating"} />

      {isCreateOpen && (
        <CreateMarketModal onClose={() => setIsCreateOpen(false)} />
      )}
    </div>
  );
}
