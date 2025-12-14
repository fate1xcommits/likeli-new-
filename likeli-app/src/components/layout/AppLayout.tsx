"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import styles from "./layout.module.css";
import ParlayBuilder from "@/components/trade/ParlayBuilder";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const [showParlay, setShowParlay] = useState(false);

    return (
        <div className={styles.appContainer}>
            <Sidebar onOpenParlay={() => setShowParlay(true)} />
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
            {showParlay && <ParlayBuilder onClose={() => setShowParlay(false)} />}
        </div>
    );
}
