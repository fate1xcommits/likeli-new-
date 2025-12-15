"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Vault,
  PieChart,
  History,
  Settings,
  Users,
  Layers
} from "lucide-react";
import styles from "./layout.module.css";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";

const NAV_ITEMS = [
  { label: "Markets", href: "/", icon: LayoutGrid },
  { label: "Vaults", href: "/vaults", icon: Vault },
  { label: "Community", href: "/community", icon: Users },
  { label: "Portfolio", href: "/portfolio", icon: PieChart },
  { label: "History", href: "/history", icon: History },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { walletAddress, username, disconnect, openWalletModal } = useAuth();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>Likeli</div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(styles.navItem, isActive && styles.navItemActive)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}

      </nav>

      <div className={styles.userSection}>
        {walletAddress ? (
          <>
            <div className={styles.avatar}>
              {username ? username.substring(0, 2).toUpperCase() : "??"}
            </div>
            <div style={{ fontSize: "var(--font-sm)", flex: 1 }}>
              <div style={{ color: "var(--text-main)", fontWeight: 500 }}>
                {username || "User"}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "var(--font-xs)" }}>
                {walletAddress.substring(0, 6)}...{walletAddress.substring(walletAddress.length - 4)}
              </div>
              <button
                onClick={disconnect}
                style={{
                  fontSize: "10px",
                  color: "#ef4444",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  marginTop: "4px",
                  textDecoration: "underline"
                }}
              >
                Disconnect
              </button>
            </div>
          </>
        ) : (
          <div style={{ width: "100%" }}>
            <button
              onClick={openWalletModal}
              className={styles.connectBtn}
              style={{
                width: "100%",
                fontSize: "14px",
                padding: "8px 16px",
                backgroundColor: "#ef4444",
                color: "#ffffff",
                border: "none",
                borderRadius: "999px",
                fontWeight: 500,
                cursor: "pointer"
              }}
            >
              Connect Wallet
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
