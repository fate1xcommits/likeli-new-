"use client";

import Sidebar from "./Sidebar";
import styles from "./layout.module.css";
import ParlaySlip from "@/components/trade/ParlaySlip";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className={styles.appContainer}>
            <Sidebar />
            <main className={styles.mainContent}>
                <div className={styles.topBar}>
                    <div className={styles.userProfile}>
                        {/* User balance or profile could go here */}
                    </div>
                </div>
                <div className={styles.contentScroll}>
                    {children}
                </div>
            </main>
            {/* Parlay Slip - floating panel */}
            <ParlaySlip />
        </div>
    );
}
