import { Component, useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { Fragment } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ DESIGN TOKENS Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Karla:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300&family=Space+Mono:wght@400;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --font-serif: 'Instrument Serif', Georgia, serif;
    --font-sans: 'Karla', system-ui, sans-serif;
    --font-mono: 'Space Mono', 'Courier New', monospace;

    --bg: #f9f7f3;
    --bg-sidebar: #f2ede4;
    --surface: #ffffff;
    --surface2: #f5f1ea;
    --surface3: #ede8de;
    --border: rgba(30,20,10,0.08);
    --border-mid: rgba(30,20,10,0.14);
    --border-strong: rgba(30,20,10,0.24);

    --ink: #1a1208;
    --ink-mid: #4a3f30;
    --ink-dim: #8a7a65;
    --ink-faint: #c4b8a4;

    --red: #b91c1c;
    --red-bg: rgba(185,28,28,0.07);
    --red-border: rgba(185,28,28,0.22);
    --amber: #b45309;
    --amber-bg: rgba(180,83,9,0.07);
    --amber-border: rgba(180,83,9,0.22);
    --green: #15803d;
    --green-bg: rgba(21,128,61,0.07);
    --green-border: rgba(21,128,61,0.22);
    --blue: #1d4ed8;
    --blue-bg: rgba(29,78,216,0.07);
    --blue-border: rgba(29,78,216,0.2);

    --sidebar-w: 252px;

    /* Backward-compatible aliases used across existing inline styles */
    --bg-0: var(--bg);
    --bg-1: var(--surface);
    --bg-2: var(--surface2);
    --bg-3: var(--surface3);
    --bg-4: #ded6c8;
    --border-bright: var(--border-strong);
    --text-0: var(--ink);
    --text-1: var(--ink-mid);
    --text-2: var(--ink-dim);
    --amber-dim: var(--amber);
    --amber-glow: var(--amber-bg);
    --red-dim: var(--red);
    --red-glow: var(--red-bg);
    --green-dim: var(--green);
    --green-glow: var(--green-bg);
    --blue-dim: var(--blue);
    --radius: 4px;
    --font-display: var(--font-serif);
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #111009;
      --bg-sidebar: #161309;
      --surface: #1c190f;
      --surface2: #231f13;
      --surface3: #2b2618;
      --border: rgba(255,240,200,0.07);
      --border-mid: rgba(255,240,200,0.12);
      --border-strong: rgba(255,240,200,0.20);

      --ink: #f0e8d8;
      --ink-mid: #bdb09a;
      --ink-dim: #7a6f5c;
      --ink-faint: #403a2c;

      --red: #fca5a5;
      --red-bg: rgba(252,165,165,0.08);
      --red-border: rgba(252,165,165,0.22);
      --amber: #fcd34d;
      --amber-bg: rgba(252,211,77,0.08);
      --amber-border: rgba(252,211,77,0.22);
      --green: #86efac;
      --green-bg: rgba(134,239,172,0.08);
      --green-border: rgba(134,239,172,0.2);
      --blue: #93c5fd;
      --blue-bg: rgba(147,197,253,0.08);
      --blue-border: rgba(147,197,253,0.18);

      --bg-4: #3a3324;
    }
  }

  html, body, #root { height: 100%; background: var(--bg-0); color: var(--text-0); font-family: var(--font-sans); }

  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg-1); }
  ::-webkit-scrollbar-thumb { background: var(--bg-4); border-radius: 3px; }

  button { cursor: pointer; font-family: var(--font-sans); }
  input, select, textarea { font-family: var(--font-sans); }

  @keyframes pulse-amber {
    0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.4); }
    50% { box-shadow: 0 0 0 6px rgba(245,158,11,0); }
  }
  @keyframes pulse-red {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
    50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(-12px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  .fade-in { animation: fadeIn 0.3s ease both; }
  .slide-in { animation: slideIn 0.25s ease both; }

  .skeleton {
    background: linear-gradient(90deg, var(--bg-2) 25%, var(--bg-3) 50%, var(--bg-2) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: var(--radius);
  }

  .topbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 200;
    height: 48px;
    background: var(--ink);
    border-bottom: 1px solid rgba(255, 240, 200, 0.12);
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 0 24px;
  }

  .topbar-brand {
    font-family: var(--font-serif);
    font-size: 15px;
    color: var(--bg);
    letter-spacing: 0.2px;
    white-space: nowrap;
  }

  .topbar-brand em {
    font-style: italic;
    color: rgba(240, 232, 216, 0.58);
  }

  .topbar-divider {
    width: 1px;
    height: 16px;
    background: rgba(255, 240, 200, 0.22);
  }

  .topbar-nav {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .topbar-nav button {
    border: none;
    background: transparent;
    color: rgba(240, 232, 216, 0.6);
    font-size: 11px;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    padding: 5px 10px;
    border-radius: 3px;
    transition: background 0.15s, color 0.15s;
  }

  .topbar-nav button:hover {
    color: var(--bg);
    background: rgba(255, 255, 255, 0.08);
  }

  .topbar-nav button.active {
    color: var(--bg);
  }

  .topbar-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .topbar-avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.12);
    display: grid;
    place-items: center;
    color: var(--bg);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .topbar-username {
    color: rgba(240, 232, 216, 0.65);
    font-size: 11px;
    letter-spacing: 0.2px;
  }

  .shell {
    display: block;
    min-height: 100vh;
    padding-top: 48px;
  }

  .sidebar {
    position: sticky;
    top: 48px;
    height: calc(100vh - 48px);
    overflow-y: auto;
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border-mid);
    display: flex;
    flex-direction: column;
  }

  .sidebar-asset-hero {
    padding: 22px 18px 18px;
    border-bottom: 1px solid var(--border-mid);
  }

  .sidebar-asset-eyebrow {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: var(--text-2);
    margin-bottom: 6px;
  }

  .sidebar-asset-name {
    font-family: var(--font-serif);
    font-size: 21px;
    line-height: 1.1;
    margin-bottom: 8px;
  }

  .sidebar-asset-tags {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }

  .sidebar-tag {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 2px;
    border: 1px solid var(--border-mid);
    background: var(--bg-3);
    color: var(--text-2);
  }

  .sidebar-tag.active {
    color: var(--green);
    background: var(--green-bg);
    border-color: var(--green-border);
  }

  .sidebar-section-label {
    padding: 14px 18px 6px;
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--ink-faint);
  }

  .sidebar-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    border: none;
    border-left: 2px solid transparent;
    background: transparent;
    color: var(--text-1);
    text-align: left;
    padding: 8px 18px;
    font-size: 12px;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .sidebar-item:hover {
    background: var(--bg-3);
    color: var(--text-0);
  }

  .sidebar-item.active {
    border-left-color: var(--red);
    background: var(--bg-2);
    color: var(--text-0);
    font-weight: 600;
  }

  .sidebar-item-badge {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 8px;
    letter-spacing: 0.5px;
    padding: 1px 6px;
    border-radius: 10px;
  }

  .badge-red { background: var(--red-bg); color: var(--red); border: 1px solid var(--red-border); }
  .badge-amber { background: var(--amber-bg); color: var(--amber); border: 1px solid var(--amber-border); }
  .badge-green { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-border); }
  .badge-dim { background: var(--bg-3); color: var(--text-2); border: 1px solid var(--border-mid); }

  .main {
    min-width: 0;
    padding: 34px 40px 72px;
    background: var(--bg-0);
  }

  .comp-layout {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 18px;
  }

  .comp-nav {
    border: 1px solid var(--border-mid);
    background: var(--bg-sidebar);
    border-radius: 4px;
    overflow: hidden;
    height: fit-content;
  }

  .comp-nav-hero {
    padding: 18px 16px;
    border-bottom: 1px solid var(--border-mid);
  }

  .comp-nav-title {
    font-family: var(--font-serif);
    font-size: 30px;
    line-height: 1.04;
    margin-bottom: 8px;
  }

  .comp-nav-tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }

  .comp-nav-tag {
    font-family: var(--font-mono);
    font-size: 8px;
    letter-spacing: 0.9px;
    text-transform: uppercase;
    border: 1px solid var(--border-mid);
    border-radius: 10px;
    padding: 2px 8px;
    background: var(--bg-2);
    color: var(--text-2);
  }

  .comp-asset-select {
    width: 100%;
    border: 1px solid var(--border-mid);
    border-radius: 3px;
    background: var(--bg-1);
    color: var(--text-0);
    padding: 6px 8px;
    font-size: 11px;
  }

  .comp-nav-list {
    padding: 8px 0;
  }

  .comp-nav-item {
    width: 100%;
    border: none;
    border-left: 2px solid transparent;
    background: transparent;
    color: var(--text-1);
    text-align: left;
    padding: 9px 12px 9px 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  .comp-nav-item:hover {
    background: var(--bg-3);
    color: var(--text-0);
  }

  .comp-nav-item.active {
    border-left-color: var(--red);
    background: var(--bg-2);
    color: var(--text-0);
    font-weight: 600;
  }

  .comp-badge {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 8px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    border-radius: 10px;
    padding: 2px 7px;
    border: 1px solid;
  }

  .comp-badge.red { color: var(--red); background: var(--red-bg); border-color: var(--red-border); }
  .comp-badge.amber { color: var(--amber); background: var(--amber-bg); border-color: var(--amber-border); }
  .comp-badge.green { color: var(--green); background: var(--green-bg); border-color: var(--green-border); }
  .comp-badge.dim { color: var(--text-2); background: var(--bg-3); border-color: var(--border-mid); }

  .comp-content {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .comp-head {
    border-bottom: 2px solid var(--text-0);
    padding-bottom: 16px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .comp-head-title {
    font-family: var(--font-serif);
    font-size: 34px;
    line-height: 1.05;
    margin-bottom: 3px;
  }

  .comp-head-sub {
    font-size: 12px;
    color: var(--text-2);
  }

  .comp-meta {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border: 1px solid var(--border-strong);
    border-radius: 3px;
    overflow: hidden;
  }

  .comp-meta-cell {
    border-right: 1px solid var(--border);
    padding: 10px 12px;
  }

  .comp-meta-cell:nth-child(3n) {
    border-right: none;
  }

  .comp-meta-label {
    font-family: var(--font-mono);
    font-size: 8px;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: var(--text-2);
    margin-bottom: 4px;
  }

  .comp-meta-value {
    font-size: 13px;
    font-weight: 500;
  }

  .comp-meta-value.warning { color: var(--amber); }
  .comp-meta-value.expired { color: var(--red); }

  .cert-editorial-card {
    border: 1px solid var(--border-strong);
    border-radius: 3px;
    overflow: hidden;
    background: var(--bg-1);
  }

  .cert-editorial-header {
    background: var(--ink);
    color: var(--bg);
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .cert-editorial-title {
    font-family: var(--font-serif);
    font-size: 16px;
    margin-right: auto;
  }

  .btn-upload-editorial {
    background: var(--red);
    color: #fff;
    border: 1px solid var(--red);
    font-size: 11px;
    padding: 7px 12px;
    border-radius: 2px;
  }

  .btn-view-editorial {
    background: transparent;
    color: rgba(240,232,216,0.78);
    border: 1px solid rgba(255,255,255,0.28);
    font-size: 11px;
    padding: 7px 12px;
    border-radius: 2px;
  }

  .btn-view-editorial:hover {
    color: #fff;
    border-color: rgba(255,255,255,0.58);
    background: rgba(255,255,255,0.08);
  }

  .cert-editorial-fields {
    display: grid;
    grid-template-columns: 1fr;
    border-top: 1px solid var(--border);
  }

  .cert-editorial-row {
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
  }

  .cert-editorial-row:last-child {
    border-bottom: none;
  }

  .cert-editorial-label {
    font-family: var(--font-mono);
    font-size: 8px;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: var(--text-2);
    margin-bottom: 4px;
  }

  .cert-editorial-value {
    font-size: 13px;
    color: var(--text-0);
    font-weight: 500;
    word-break: break-word;
  }

  .cert-editorial-value.expired { color: var(--red); }
  .cert-editorial-value.warning { color: var(--amber); }

  .audit-editorial {
    background: var(--bg-2);
    border-top: 1px solid var(--border);
  }

  .audit-editorial-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 16px;
    border-bottom: 1px solid var(--border);
  }

  .audit-editorial-title {
    margin-right: auto;
    font-family: var(--font-serif);
    font-style: italic;
    color: var(--text-1);
    font-size: 15px;
  }

  .audit-editorial-count {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 1px;
    color: var(--text-2);
  }

  .audit-editorial-table {
    width: 100%;
    border-collapse: collapse;
  }

  .audit-editorial-table th {
    text-align: left;
    font-family: var(--font-mono);
    font-size: 8px;
    letter-spacing: 1.3px;
    text-transform: uppercase;
    color: var(--text-2);
    padding: 8px 16px;
    border-bottom: 1px solid var(--border-mid);
  }

  .audit-editorial-table td {
    padding: 9px 16px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-1);
  }

  .audit-editorial-table tbody tr:hover td {
    background: var(--bg-3);
  }

  .audit-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 7px;
    background: var(--green);
  }

  .audit-pill {
    display: inline-block;
    font-family: var(--font-mono);
    font-size: 8px;
    letter-spacing: 1px;
    text-transform: uppercase;
    border-radius: 2px;
    border: 1px solid var(--green-border);
    color: var(--green);
    background: var(--green-bg);
    padding: 2px 7px;
  }

  .audit-mono {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-0);
  }

  .cert-accordion-body {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.28s ease;
    overflow: hidden;
  }
  .cert-accordion-body.open {
    grid-template-rows: 1fr;
  }
  .cert-accordion-inner {
    overflow: hidden;
  }

  @media (max-width: 1100px) {
    .comp-layout {
      grid-template-columns: 1fr;
    }
  }
`;

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ AUTH CONTEXT Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);
const AppFeedbackContext = createContext({ notifyError: () => {}, notifyInfo: () => {} });
const ConfirmContext = createContext(async () => false);
const RequestStateContext = createContext({ pending: 0, beginRequest: () => {}, endRequest: () => {} });
const useFeedback = () => useContext(AppFeedbackContext);
const useConfirm = () => useContext(ConfirmContext);
const useRequestState = () => useContext(RequestStateContext);

const API_INFLIGHT_GET = new Map();
const API_CACHE_GET = new Map();

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ams_user") || "null"); } catch { return null; }
  });

  const login = useCallback((userData) => {
    setUser(userData);
    localStorage.setItem("ams_user", JSON.stringify(userData));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("ams_user");
  }, []);

  return <AuthContext.Provider value={{ user, login, logout, isAdmin: user?.role === "ADMIN" }}>{children}</AuthContext.Provider>;
}

function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return createPortal(
    <div style={{ position: "fixed", top: 14, right: 14, zIndex: 2000, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          minWidth: 240, maxWidth: 420, background: "var(--bg-1)", border: "1px solid var(--border-bright)",
          borderLeft: `3px solid ${t.kind === "error" ? "var(--red)" : "var(--amber)"}`, borderRadius: 4, padding: "10px 12px",
          boxShadow: "0 8px 18px rgba(0,0,0,0.3)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: t.kind === "error" ? "var(--red)" : "var(--amber)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {t.kind}
            </span>
            <button onClick={() => onDismiss(t.id)} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-2)", fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-0)" }}>{t.message}</div>
        </div>
      ))}
    </div>,
    document.body
  );
}

function TopProgressBar() {
  const { pending } = useRequestState();
  return createPortal(
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      height: 2,
      zIndex: 2100,
      opacity: pending > 0 ? 1 : 0,
      transition: "opacity 0.2s ease",
      background: "linear-gradient(90deg, var(--amber) 0%, var(--blue) 50%, var(--amber) 100%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 0.9s linear infinite",
      pointerEvents: "none",
    }} />,
    document.body
  );
}

function AppFeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [pending, setPending] = useState(0);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const pushToast = useCallback((kind, message) => {
    if (!message) return;
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts(prev => [...prev, { id, kind, message }]);
    window.setTimeout(() => dismissToast(id), 3500);
  }, [dismissToast]);

  const notifyError = useCallback((message) => pushToast("error", message), [pushToast]);
  const notifyInfo = useCallback((message) => pushToast("info", message), [pushToast]);
  const beginRequest = useCallback(() => setPending(p => p + 1), []);
  const endRequest = useCallback(() => setPending(p => (p > 0 ? p - 1 : 0)), []);

  const confirm = useCallback((message) => new Promise((resolve) => {
    setConfirmState({ message, resolve });
  }), []);

  const resolveConfirm = useCallback((ok) => {
    setConfirmState(current => {
      current?.resolve(ok);
      return null;
    });
  }, []);

  return (
    <RequestStateContext.Provider value={{ pending, beginRequest, endRequest }}>
      <AppFeedbackContext.Provider value={{ notifyError, notifyInfo }}>
        <ConfirmContext.Provider value={confirm}>
          {children}
          <TopProgressBar />
          <ToastStack toasts={toasts} onDismiss={dismissToast} />
          {confirmState && (
            <Modal title="Confirm Action" onClose={() => resolveConfirm(false)} width={420}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ color: "var(--text-1)", fontSize: 12 }}>{confirmState.message || "Are you sure?"}</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <Button onClick={() => resolveConfirm(false)}>Cancel</Button>
                  <Button variant="danger" onClick={() => resolveConfirm(true)}>Confirm</Button>
                </div>
              </div>
            </Modal>
          )}
        </ConfirmContext.Provider>
      </AppFeedbackContext.Provider>
    </RequestStateContext.Provider>
  );
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("Unhandled UI error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "var(--bg-0)" }}>
          <Card style={{ width: 520, maxWidth: "95vw", padding: 24 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, marginBottom: 6 }}>Something went wrong</div>
            <div style={{ color: "var(--text-1)", fontSize: 12, marginBottom: 16 }}>
              The app hit an unexpected error. Reload to recover.
            </div>
            <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ API LAYER Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const BASE = "http://localhost:8080";

function useApi() {
  const { user, logout } = useAuth();
  const { notifyError } = useFeedback();
  const { beginRequest, endRequest } = useRequestState();

  const req = useCallback(async (method, path, body, options = {}) => {
    const cacheTTL = options.cacheTTL ?? 0;
    const headers = { "Content-Type": "application/json" };
    if (user?.token) headers["Authorization"] = `Bearer ${user.token}`;

    const cacheKey = method === "GET" ? `${path}::${user?.token || ""}` : null;
    if (method === "GET" && cacheTTL > 0) {
      const cached = API_CACHE_GET.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) return cached.data;
      API_CACHE_GET.delete(cacheKey);
    }
    if (method === "GET" && API_INFLIGHT_GET.has(cacheKey)) {
      return API_INFLIGHT_GET.get(cacheKey);
    }

    const run = async () => {
      if (options.trackLoading !== false) beginRequest();
      try {
        const res = await fetch(`${BASE}${path}`, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: options.signal,
        });

        if (res.status === 401 && options.handle401 !== false) {
          logout();
          throw new Error("Session expired. Please log in again.");
        }

        let data = null;
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          data = await res.json();
        } else if (res.status !== 204) {
          const text = await res.text();
          data = text ? { message: text } : null;
        }

        if (!res.ok) throw new Error(data?.error || data?.message || `Request failed (${res.status})`);

        if (method === "GET" && cacheTTL > 0) {
          API_CACHE_GET.set(cacheKey, { data, expiresAt: Date.now() + cacheTTL });
        } else if (method !== "GET") {
          API_CACHE_GET.clear();
        }

        return data;
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        if (!options.silentError) notifyError(error?.message || "Request failed");
        throw error;
      } finally {
        if (options.trackLoading !== false) endRequest();
      }
    };

    if (method === "GET") {
      const promise = run().finally(() => {
        API_INFLIGHT_GET.delete(cacheKey);
      });
      API_INFLIGHT_GET.set(cacheKey, promise);
      return promise;
    }

    try {
      return await run();
    } finally {
      if (method === "GET") API_INFLIGHT_GET.delete(cacheKey);
    }
  }, [user, logout, notifyError, beginRequest, endRequest]);

  return useMemo(() => ({
    get: (p, opts) => req("GET", p, undefined, opts),
    post: (p, b, opts) => req("POST", p, b, opts),
    put: (p, b, opts) => req("PUT", p, b, opts),
    patch: (p, b, opts) => req("PATCH", p, b, opts),
    del: (p, opts) => req("DELETE", p, undefined, opts),
  }), [req]);
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ DESIGN COMPONENTS Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function StatusBadge({ status }) {
  const cfg = {
    ACTIVE:   { color: "var(--green)", bg: "var(--green-glow)", label: "ACTIVE" },
    INACTIVE: { color: "var(--text-2)", bg: "var(--bg-3)", label: "INACTIVE" },
    MAINTENANCE: { color: "var(--amber)", bg: "var(--amber-glow)", label: "MAINT." },
    VALID:    { color: "var(--green)", bg: "var(--green-glow)", label: "VALID" },
    EXPIRED:  { color: "var(--red)", bg: "var(--red-glow)", label: "EXPIRED", pulse: true },
    EXPIRING_SOON: { color: "var(--amber)", bg: "var(--amber-glow)", label: "⚠ EXPIRING", pulse: true },
    ADMIN: { color: "var(--amber)", bg: "var(--amber-glow)", label: "ADMIN" },
    USER:  { color: "var(--blue)", bg: "rgba(59,130,246,0.12)", label: "USER" },
    YES:   { color: "var(--red)", bg: "var(--red-glow)", label: "CRITICAL" },
    NO:    { color: "var(--text-2)", bg: "var(--bg-3)", label: "STANDARD" },
  }[status] || { color: "var(--text-1)", bg: "var(--bg-3)", label: status };

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 8px", borderRadius: 2,
      background: cfg.bg, color: cfg.color,
      fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
      border: `1px solid ${cfg.color}30`,
      animation: cfg.pulse ? `${status === "EXPIRED" ? "pulse-red" : "pulse-amber"} 2s infinite` : "none",
    }}>
      {cfg.pulse && <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, display: "inline-block" }} />}
      {cfg.label}
    </span>
  );
}

function Button({ children, variant = "default", size = "md", onClick, disabled, style }) {
  const styles = {
    default: { background: "var(--bg-3)", color: "var(--text-0)", borderColor: "var(--border)" },
    primary: { background: "var(--amber)", color: "#000", borderColor: "var(--amber)" },
    danger:  { background: "transparent", color: "var(--red)", borderColor: "var(--red)" },
    ghost:   { background: "transparent", color: "var(--text-1)", borderColor: "transparent" },
  }[variant];
  const pad = size === "sm" ? "4px 10px" : size === "lg" ? "10px 22px" : "6px 14px";
  const fs = size === "sm" ? 11 : size === "lg" ? 13 : 12;

  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: pad, fontSize: fs, fontWeight: 500, letterSpacing: "0.05em",
      ...styles, border: `1px solid ${styles.borderColor}`,
      borderRadius: 3, transition: "all 0.15s", cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1, fontFamily: "var(--font-mono)", textTransform: "uppercase", ...style
    }}>{children}</button>
  );
}

function Input({ label, value, onChange, type = "text", placeholder, required, options, onKeyDown }) {
  const base = {
    width: "100%", background: "var(--bg-2)", border: "1px solid var(--border)",
    borderRadius: 3, padding: "7px 10px", color: "var(--text-0)", fontSize: 12,
    fontFamily: "var(--font-mono)", outline: "none",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <label style={{ fontSize: 10, color: "var(--text-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}{required && " *"}</label>}
      {options ? (
        <select value={value} onChange={e => onChange(e.target.value)} style={{ ...base }}>
          <option value="">— Select —</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : type === "textarea" ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
          style={{ ...base, resize: "vertical" }} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          onKeyDown={onKeyDown} style={base} />
      )}
    </div>
  );
}

function Card({ children, style }) {
  return <div style={{ background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 4, ...style }}>{children}</div>;
}

function Modal({ title, onClose, children, width = 540 }) {
  const modalNode = (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.78)",
    }}>
      <div style={{
        position: "absolute", inset: 0, overflowY: "auto",
        display: "flex", justifyContent: "center", padding: "40px 16px",
      }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="fade-in" onClick={e => e.stopPropagation()} style={{
          width, maxWidth: "95vw", alignSelf: "flex-start",
          background: "var(--bg-1)", border: "1px solid var(--border-bright)",
          borderRadius: 4,
        }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, letterSpacing: "0.02em" }}>{title}</span>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-2)", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
          </div>
          <div style={{ padding: 20 }}>{children}</div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
}

function Table({ columns, data, onRowClick, loading, emptyMsg = "No records found.", rowKey, expandedRowKey = null, renderExpandedRow = null }) {
  if (loading) return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
      {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 38 }} />)}
    </div>
  );
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {columns.map(c => (
              <th key={c.key} style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-2)", fontWeight: 500, letterSpacing: "0.06em", fontSize: 10, textTransform: "uppercase", whiteSpace: "nowrap" }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ padding: 32, textAlign: "center", color: "var(--text-2)" }}>{emptyMsg}</td></tr>
          ) : data.map((row, i) => {
            const key = rowKey?.(row, i) ?? row?.id ?? row?.asset_id ?? row?.component_id ?? row?.certificate_id ?? row?.category_id ?? row?.test_id ?? row?.user_id ?? i;
            const isExpanded = expandedRowKey !== null && key === expandedRowKey;
            return (
              <Fragment key={key}>
                <tr onClick={() => onRowClick?.(row)} style={{
                  borderBottom: "1px solid var(--border)", cursor: onRowClick ? "pointer" : "default",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { if(onRowClick) e.currentTarget.style.background = "var(--bg-2)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = ""; }}
                >
                  {columns.map(c => (
                    <td key={c.key} style={{ padding: "9px 12px", color: "var(--text-0)", ...c.style }}>
                      {c.render ? c.render(row[c.key], row) : row[c.key] ?? <span style={{ color: "var(--text-2)" }}>—</span>}
                    </td>
                  ))}
                </tr>
                {isExpanded && renderExpandedRow && (
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <td colSpan={columns.length} style={{ padding: "10px 12px", background: "var(--bg-2)" }}>
                      {renderExpandedRow(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({ meta, onPage }) {
  if (!meta || meta.total_pages <= 1) return null;
  return (
    <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "var(--text-2)" }}>
      <span>Page {meta.page} of {meta.total_pages} · {meta.total} records</span>
      <div style={{ display: "flex", gap: 6 }}>
        <Button size="sm" onClick={() => onPage(meta.page - 1)} disabled={meta.page === 1}>← Prev</Button>
        <Button size="sm" onClick={() => onPage(meta.page + 1)} disabled={meta.page === meta.total_pages}>Next →</Button>
      </div>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString();
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ LOGIN PAGE Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function LoginPage() {
  const api = useApi();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async () => {
    setError(""); setLoading(true);
    try {
      const data = await api.post("/login", { email, password }, { handle401: false, silentError: true });
      login(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg-0)",
      backgroundImage: "radial-gradient(ellipse at 20% 50%, rgba(245,158,11,0.06) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(59,130,246,0.04) 0%, transparent 50%)",
    }}>
      <div className="fade-in" style={{ width: 380 }}>
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>
            <span style={{ color: "var(--amber)" }}>AMS</span>
          </div>
          <div style={{ fontSize: 10, color: "var(--text-2)", letterSpacing: "0.15em", textTransform: "uppercase" }}>Asset Management System</div>
        </div>

        <Card style={{ padding: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="ops@company.com" required onKeyDown={e => e.key === "Enter" && handleSubmit()} />
            <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" required onKeyDown={e => e.key === "Enter" && handleSubmit()} />
            {error && <div style={{ padding: "8px 12px", background: "var(--red-glow)", border: "1px solid var(--red)30", borderRadius: 3, color: "var(--red)", fontSize: 11 }}>{error}</div>}
            <Button variant="primary" size="lg" onClick={handleSubmit} disabled={loading || !email || !password} style={{ width: "100%", marginTop: 4 }}>
              {loading ? "Authenticating..." : "Sign In →"}
            </Button>
          </div>
        </Card>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 10, color: "var(--text-2)", letterSpacing: "0.06em" }}>
          SECURE ACCESS · ROLE-BASED PERMISSIONS
        </div>
      </div>
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ SIDEBAR Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const TOP_NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "assets", label: "Assets", adminOnly: true },
  { id: "users", label: "Users", adminOnly: true },
];

function TopBar({ active, onNav }) {
  const { user, isAdmin, logout } = useAuth();
  const visible = TOP_NAV_ITEMS.filter(n => !n.adminOnly || isAdmin);
  const initials = `${user?.first_name?.[0] || ""}${user?.last_name?.[0] || ""}`.toUpperCase() || "US";

  return (
    <header className="topbar">
      <span className="topbar-brand">Asset Management <em>System</em></span>
      <div className="topbar-divider" />
      <nav className="topbar-nav">
        {visible.map(item => (
          <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => onNav(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="topbar-right">
        <div className="topbar-avatar">{initials}</div>
        <span className="topbar-username">{user?.first_name} {user?.last_name}</span>
        <div className="topbar-divider" />
        <button onClick={logout} style={{
          border: "1px solid rgba(255,240,200,0.18)", background: "transparent",
          color: "rgba(240,232,216,0.6)", fontSize: 11, letterSpacing: "0.08em",
          textTransform: "uppercase", padding: "4px 10px", borderRadius: 3, cursor: "pointer",
          transition: "all 0.15s",
        }}
        onMouseEnter={e => { e.target.style.color = "var(--bg)"; e.target.style.borderColor = "rgba(255,240,200,0.45)"; }}
        onMouseLeave={e => { e.target.style.color = "rgba(240,232,216,0.6)"; e.target.style.borderColor = "rgba(255,240,200,0.18)"; }}
        >Sign Out</button>
      </div>
    </header>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ PAGE HEADER Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 3 }}>{title}</h1>
        {subtitle && <div style={{ fontSize: 11, color: "var(--text-2)", letterSpacing: "0.04em" }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}


// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function CertDonut({ certs, loading }) {

  const valid    = certs.filter(c => c.status === "VALID").length;
  const expiring = certs.filter(c => c.status === "EXPIRING_SOON").length;
  const expired  = certs.filter(c => c.status === "EXPIRED").length;
  const total    = valid + expiring + expired;

  const data = [
    { name: "Valid",    value: valid,    color: "#15803d" },
    { name: "Expiring", value: expiring, color: "#b45309" },
    { name: "Expired",  value: expired,  color: "#b91c1c" },
  ].filter(d => d.value > 0);

  if (loading) return (
    <div style={{ height: 220, display: "grid", placeItems: "center" }}>
      <div className="skeleton" style={{ width: 160, height: 160, borderRadius: "50%" }} />
    </div>
  );

  if (total === 0) return (
    <div style={{ height: 220, display: "grid", placeItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "var(--green)", fontSize: 32, marginBottom: 6 }}>✓</div>
        <div style={{ fontSize: 11, color: "var(--text-2)" }}>No certificates</div>
      </div>
    </div>
  );

  return (
    <div style={{ position: "relative", height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={64} outerRadius={88}
            paddingAngle={2} dataKey="value" strokeWidth={0}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-mid)", borderRadius: 3, fontSize: 11, fontFamily: "var(--font-mono)" }}
            formatter={(value, name) => [value, name]}
          />
          <Legend iconType="circle" iconSize={7}
            formatter={(value) => <span style={{ fontSize: 10, color: "var(--ink-mid)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -74%)", textAlign: "center", pointerEvents: "none" }}>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, lineHeight: 1, color: "var(--ink)" }}>{total}</div>
        <div style={{ fontSize: 9, color: "var(--ink-dim)", letterSpacing: "1.2px", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}>certs</div>
      </div>
    </div>
  );
}

function Dashboard({ onOpenAsset, onOpenComponent }) {
  const api = useApi();
  const [allCerts, setAllCerts]     = useState([]);
  const [assets, setAssets]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [certFilter, setCertFilter] = useState("ALL");

  const load = useCallback(async (signal) => {
    Promise.all([
      api.get("/assets?limit=200", { signal }),
      api.get("/certificates/dashboard?limit=1000", { signal }),
    ]).then(([a, d]) => {
      if (signal?.aborted) return;
      setAssets(a?.data || []);
      setAllCerts(d?.data || []);
    }).catch((e) => {
      if (e?.name !== "AbortError") console.error(e);
    }).finally(() => { if (!signal?.aborted) setLoading(false); });
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const visibleCerts = useMemo(() => {
    if (selectedAssetId) return allCerts.filter(c => c.asset_id === selectedAssetId);
    return allCerts;
  }, [allCerts, selectedAssetId]);

  const alertCerts = useMemo(() => {
    const base = visibleCerts.filter(c => c.status === "EXPIRED" || c.status === "EXPIRING_SOON");
    if (certFilter === "ALL") return base;
    return base.filter(c => c.status === certFilter);
  }, [visibleCerts, certFilter]);

  const selectedAsset = useMemo(() => assets.find(a => a.asset_id === selectedAssetId) || null, [assets, selectedAssetId]);

  const getAssetBadge = useCallback((assetId) => {
    const certs = allCerts.filter(c => c.asset_id === assetId);
    if (certs.some(c => c.status === "EXPIRED"))       return { cls: "red",   label: "!" };
    if (certs.some(c => c.status === "EXPIRING_SOON")) return { cls: "amber", label: "~" };
    if (certs.length > 0)                              return { cls: "green", label: "✓" };
    return { cls: "dim", label: "—" };
  }, [allCerts]);

  return (
    <div className="fade-in">
      <PageHeader
        title={selectedAsset ? selectedAsset.name : "Operations Dashboard"}
        subtitle={selectedAsset ? `Asset dashboard · ${visibleCerts.length} certificates` : "Real-time compliance overview"}
      />
      <div className="comp-layout">
        <aside className="comp-nav">
          <div className="comp-nav-hero">
            <div className="comp-nav-title">Assets</div>
            <div className="comp-nav-tags">
              <span className="comp-nav-tag">{loading ? "..." : `${assets.length} Total`}</span>
            </div>
          </div>
          <div className="comp-nav-list">
            <button
              className={`comp-nav-item ${selectedAssetId === null ? "active" : ""}`}
              onClick={() => setSelectedAssetId(null)}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>All Assets</span>
              <span className="comp-badge dim">Overview</span>
            </button>
            {loading && <div style={{ padding: "10px 14px", color: "var(--text-2)", fontSize: 12 }}>Loading...</div>}
            {!loading && assets.map(asset => {
              const badge = getAssetBadge(asset.asset_id);
              const isActive = selectedAssetId === asset.asset_id;
              return (
                <div key={asset.asset_id} style={{ display: "flex", alignItems: "center", borderLeft: isActive ? "2px solid var(--red)" : "2px solid transparent", background: isActive ? "var(--bg-2)" : "transparent" }}>
                  <button
                    style={{ flex: 1, border: "none", background: "transparent", color: isActive ? "var(--text-0)" : "var(--text-1)", textAlign: "left", padding: "8px 8px 8px 14px", fontSize: 12, fontWeight: isActive ? 600 : 400, display: "flex", alignItems: "center", gap: 8, overflow: "hidden", cursor: "pointer" }}
                    onClick={() => setSelectedAssetId(asset.asset_id)}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.name}</span>
                    <span className={`comp-badge ${badge.cls}`} style={{ flexShrink: 0 }}>{badge.label}</span>
                  </button>
                  <button
                    title="Open Components"
                    onClick={() => onOpenAsset(asset.asset_id)}
                    style={{ flexShrink: 0, border: "none", background: "transparent", color: "var(--ink-dim)", padding: "8px 12px", fontSize: 13, cursor: "pointer" }}
                  >→</button>
                </div>
              );
            })}
            {!loading && assets.length === 0 && <div style={{ padding: "10px 14px", color: "var(--text-2)", fontSize: 12 }}>No assets found.</div>}
          </div>
        </aside>

        <section className="comp-content">
          {selectedAsset && (
            <Card style={{ marginBottom: 16 }}>
              <div className="comp-meta">
                <div className="comp-meta-cell"><div className="comp-meta-label">Status</div><div className="comp-meta-value"><StatusBadge status={selectedAsset.status} /></div></div>
                <div className="comp-meta-cell"><div className="comp-meta-label">Location</div><div className="comp-meta-value">{selectedAsset.location || "—"}</div></div>
                <div className="comp-meta-cell"><div className="comp-meta-label">Project</div><div className="comp-meta-value">{selectedAsset.assigned_project || "—"}</div></div>
                <div className="comp-meta-cell"><div className="comp-meta-label">Added</div><div className="comp-meta-value">{formatDate(selectedAsset.created_at)}</div></div>
                {selectedAsset.description && <div className="comp-meta-cell" style={{ gridColumn: "1 / -1" }}><div className="comp-meta-label">Description</div><div className="comp-meta-value">{selectedAsset.description}</div></div>}
              </div>
            </Card>
          )}

          <Card style={{ marginBottom: 16 }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700 }}>Certificate Status</span>
            </div>
            <div style={{ padding: "8px 16px 16px" }}>
              <CertDonut certs={visibleCerts} loading={loading} />
            </div>
          </Card>

          <Card>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "var(--amber)", fontSize: 14 }}>⚠</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700 }}>Certificate Alerts</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-2)" }}>{alertCerts.length} ITEMS</span>
              <select
                value={certFilter}
                onChange={e => setCertFilter(e.target.value)}
                style={{ fontSize: 10, fontFamily: "var(--font-mono)", background: "var(--bg-2)", border: "1px solid var(--border-mid)", borderRadius: 3, color: "var(--text-0)", padding: "3px 7px" }}
              >
                <option value="ALL">All Alerts</option>
                <option value="EXPIRING_SOON">Expiring Soon</option>
                <option value="EXPIRED">Expired</option>
              </select>
            </div>
            {alertCerts.length === 0 && !loading ? (
              <div style={{ padding: 32, textAlign: "center" }}>
                <div style={{ color: "var(--green)", fontSize: 28, marginBottom: 8 }}>✓</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, marginBottom: 4 }}>All Clear</div>
                <div style={{ fontSize: 11, color: "var(--text-2)" }}>No certificates require attention.</div>
              </div>
            ) : (
              <Table
                loading={loading}
                data={alertCerts}
                onRowClick={row => onOpenComponent(row.asset_id, row.component_id)}
                columns={[
                  { key: "certificate_name", label: "Certificate" },
                  { key: "component_name",   label: "Component" },
                  { key: "asset_name",       label: "Asset" },
                  { key: "expiry_date",      label: "Expires", render: v => <span style={{ color: "var(--amber)", fontWeight: 600 }}>{formatDate(v)}</span> },
                  { key: "status",           label: "Status",  render: v => <StatusBadge status={v} /> },
                ]}
              />
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}


// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ ASSETS PAGE Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function AssetForm({ initial, onSubmit, onClose, submitting = false }) {
  const [form, setForm] = useState(initial || { name: "", description: "", status: "ACTIVE", location: "", assigned_project: "", photo: "", datasheet: "" });
  const f = (k) => (v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Input label="Name" value={form.name} onChange={f("name")} required />
      <Input label="Status" value={form.status} onChange={f("status")} options={[{value:"ACTIVE",label:"Active"},{value:"INACTIVE",label:"Inactive"},{value:"MAINTENANCE",label:"Maintenance"}]} required />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Location" value={form.location} onChange={f("location")} />
        <Input label="Assigned Project" value={form.assigned_project} onChange={f("assigned_project")} />
      </div>
      <Input label="Description" type="textarea" value={form.description} onChange={f("description")} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Photo URL" value={form.photo} onChange={f("photo")} />
        <Input label="Datasheet URL" value={form.datasheet} onChange={f("datasheet")} />
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="primary" onClick={() => onSubmit(form)} disabled={submitting}>
          {submitting ? "Saving..." : "Save Asset"}
        </Button>
      </div>
    </div>
  );
}

function AssetsPage() {
  const api = useApi();
  const { isAdmin } = useAuth();
  const confirmAction = useConfirm();
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async (p = 1, opts = {}) => {
    setLoading(true);
    try {
      const res = await api.get(`/assets?page=${p}&limit=20`, { signal: opts.signal });
      if (opts.signal?.aborted) return;
      setData(res.data || []); setMeta(res.meta);
    } catch (e) {
      if (e?.name !== "AbortError") throw e;
    } finally { if (!opts.signal?.aborted) setLoading(false); }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load(page, { signal: controller.signal });
    return () => controller.abort();
  }, [page, load]);

  const handleCreate = async (form) => {
    setSubmitting(true);
    try {
      await api.post("/addasset", form);
      setModal(null);
      load(page);
    } finally {
      setSubmitting(false);
    }
  };
  const handleUpdate = async (form) => {
    setSubmitting(true);
    try {
      await api.put(`/updateasset/${selected.asset_id}`, form);
      setModal(null);
      setSelected(null);
      load(page);
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async (id) => {
    if (!(await confirmAction("Delete this asset?"))) return;
    await api.del(`/deleteasset/${id}`); load(page);
  };

  return (
    <div className="fade-in">
      <PageHeader title="Assets" subtitle={`${meta?.total || 0} registered assets`}
        action={isAdmin && <Button variant="primary" onClick={() => setModal("create")}>+ New Asset</Button>} />
      <Card>
        <Table loading={loading} data={data}
          columns={[
            { key: "asset_id", label: "ID", render: v => <span style={{ color: "var(--text-2)", fontWeight: 500 }}>{v}</span> },
            { key: "name", label: "Name", render: v => <span style={{ fontWeight: 500 }}>{v}</span> },
            { key: "status", label: "Status", render: v => <StatusBadge status={v} /> },
            { key: "location", label: "Location" },
            { key: "assigned_project", label: "Project" },
            { key: "created_at", label: "Created", render: v => formatDate(v) },
            isAdmin ? { key: "asset_id", label: "", render: (v, row) => (
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" onClick={e => { e.stopPropagation(); setSelected(row); setModal("edit"); }}>Edit</Button>
                <Button size="sm" variant="danger" onClick={e => { e.stopPropagation(); handleDelete(v); }}>Del</Button>
              </div>
            )} : null
          ].filter(Boolean)}
        />
        <Pagination meta={meta} onPage={setPage} />
      </Card>

      {modal === "create" && <Modal title="New Asset" onClose={() => setModal(null)}>
        <AssetForm onSubmit={handleCreate} onClose={() => setModal(null)} submitting={submitting} />
      </Modal>}
      {modal === "edit" && selected && <Modal title="Edit Asset" onClose={() => { setModal(null); setSelected(null); }}>
        <AssetForm initial={selected} onSubmit={handleUpdate} onClose={() => { setModal(null); setSelected(null); }} submitting={submitting} />
      </Modal>}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ COMPONENTS PAGE Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function ComponentForm({ initial, assets, categories, onSubmit, onClose, submitting = false }) {
  const baseForm = { asset_id: "", category_id: "", name: "", serial_number: "", manufacturer: "", description: "", equipment_type: "", structure: "", model: "", class: "", class_code: "", safety_critical: "NO" };
  const [form, setForm] = useState({ ...baseForm, ...(initial || {}) });
  const f = (k) => (v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Asset" value={form.asset_id} onChange={f("asset_id")} options={assets.map(a => ({ value: a.asset_id, label: a.name }))} required />
        <Input label="Category" value={form.category_id} onChange={f("category_id")} options={categories.map(c => ({ value: c.category_id, label: c.category_name }))} required />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Name" value={form.name} onChange={f("name")} required />
        <Input label="Serial Number" value={form.serial_number} onChange={f("serial_number")} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Manufacturer" value={form.manufacturer} onChange={f("manufacturer")} />
        <Input label="Model" value={form.model} onChange={f("model")} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Input label="Equipment Type" value={form.equipment_type} onChange={f("equipment_type")} />
        <Input label="Structure" value={form.structure} onChange={f("structure")} />
        <Input label="Class" value={form.class} onChange={f("class")} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Class Code" value={form.class_code} onChange={f("class_code")} />
        <Input label="Safety Critical" value={form.safety_critical} onChange={f("safety_critical")} options={[{value:"YES",label:"Yes — Safety Critical"},{value:"NO",label:"No — Standard"}]} required />
      </div>
      <Input label="Description" type="textarea" value={form.description} onChange={f("description")} />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="primary" onClick={() => onSubmit(form)} disabled={submitting}>
          {submitting ? "Saving..." : "Save Component"}
        </Button>
      </div>
    </div>
  );
}

function ComponentsAssetPicker({ onOpenAsset }) {
  const api = useApi();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api.get("/assets?limit=500", { signal: controller.signal })
      .then((res) => { if (!controller.signal.aborted) setAssets(res?.data || []); })
      .catch((e) => { if (e?.name !== "AbortError") console.error(e); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api]);

  return (
    <div className="fade-in">
      <PageHeader title="Assets" subtitle="Select an asset to open its components" />
      <div className="comp-layout">
        <aside className="comp-nav">
          <div className="comp-nav-hero">
            <div className="comp-nav-title">Assets</div>
            <div className="comp-nav-tags">
              <span className="comp-nav-tag">{assets.length} Total</span>
            </div>
          </div>
          <div className="comp-nav-list">
            {loading && <div style={{ padding: "10px 14px", color: "var(--text-2)", fontSize: 12 }}>Loading assets...</div>}
            {!loading && assets.map(asset => (
              <button key={asset.asset_id} className="comp-nav-item" onClick={() => onOpenAsset(asset.asset_id)}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.name}</span>
                <span className="comp-badge dim">Open</span>
              </button>
            ))}
            {!loading && assets.length === 0 && <div style={{ padding: "10px 14px", color: "var(--text-2)", fontSize: 12 }}>No assets found.</div>}
          </div>
        </aside>
        <section className="comp-content">
          <Card style={{ padding: 18, color: "var(--text-2)", fontSize: 12 }}>
            Choose an asset from the left pane to open its component page.
          </Card>
        </section>
      </div>
    </div>
  );
}

function ComponentsPage({ selectedAssetId, initialComponentId, onBackToAssets }) {
  const api = useApi();
  const { user, isAdmin } = useAuth();
  const confirmAction = useConfirm();
  const { notifyInfo, notifyError } = useFeedback();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [assets, setAssets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [certificatesByComponent, setCertificatesByComponent] = useState({});
  const [certificatesLoadingByComponent, setCertificatesLoadingByComponent] = useState({});
  const [certificatesErrorByComponent, setCertificatesErrorByComponent] = useState({});
  const [uploadBusyByCertificate, setUploadBusyByCertificate] = useState({});
  const [uploadAuditByCertificate, setUploadAuditByCertificate] = useState({});
  const [uploadAuditLoadingByCertificate, setUploadAuditLoadingByCertificate] = useState({});
  const [uploadAuditErrorByCertificate, setUploadAuditErrorByCertificate] = useState({});
  const [selectedComponentId, setSelectedComponentId] = useState("");
  const [certModal, setCertModal] = useState(null); // "add"
  const [testTypes, setTestTypes] = useState([]);
  const [expandedCertId, setExpandedCertId] = useState(null);

  const load = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const [componentsRes, assetsRes, categoriesRes, testTypesRes] = await Promise.all([
        api.get("/components?page=1&limit=500", { signal: opts.signal }),
        api.get("/assets?limit=200", { signal: opts.signal }),
        api.get("/categories?limit=200", { signal: opts.signal }),
        api.get("/test-types", { signal: opts.signal }),
      ]);
      if (opts.signal?.aborted) return;
      const componentsData = componentsRes?.data || [];
      const assetsData = assetsRes?.data || [];
      setData(componentsData);
      setAssets(assetsData);
      setCategories(categoriesRes?.data || []);
      setTestTypes(testTypesRes?.data || testTypesRes || []);
    } catch (e) {
      if (e?.name !== "AbortError") throw e;
    } finally { if (!opts.signal?.aborted) setLoading(false); }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load({ signal: controller.signal });
    return () => controller.abort();
  }, [api]);

  const handleCreate = async (form) => {
    setSubmitting(true);
    try {
      await api.post("/addcomponent", form);
      setModal(null);
      load();
    } finally {
      setSubmitting(false);
    }
  };
  const handleUpdate = async (form) => {
    setSubmitting(true);
    try {
      await api.put(`/updatecomponent/${selected.component_id}`, form);
      setModal(null);
      load();
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async (id, clearSelection = false) => {
    if (!(await confirmAction("Delete this component?"))) return;
    await api.del(`/deletecomponent/${id}`);
    if (clearSelection) setSelectedComponentId("");
    load();
  };

  const loadCertificatesForComponent = useCallback(async (componentID) => {
    setCertificatesLoadingByComponent(prev => ({ ...prev, [componentID]: true }));
    setCertificatesErrorByComponent(prev => ({ ...prev, [componentID]: "" }));
    try {
      const res = await api.get(`/certificates/component/${componentID}?page=1&limit=100`);
      setCertificatesByComponent(prev => ({ ...prev, [componentID]: res?.data || [] }));
    } catch (e) {
      setCertificatesErrorByComponent(prev => ({ ...prev, [componentID]: e?.message || "Failed to load certificates." }));
    } finally {
      setCertificatesLoadingByComponent(prev => ({ ...prev, [componentID]: false }));
    }
  }, [api]);

  const loadCertificateUploadAudit = useCallback(async (certificateID) => {
    setUploadAuditLoadingByCertificate(prev => ({ ...prev, [certificateID]: true }));
    setUploadAuditErrorByCertificate(prev => ({ ...prev, [certificateID]: "" }));
    try {
      const res = await api.get(`/certificate/${certificateID}/uploads?page=1&limit=25`);
      setUploadAuditByCertificate(prev => ({ ...prev, [certificateID]: res?.data || [] }));
    } catch (e) {
      setUploadAuditErrorByCertificate(prev => ({ ...prev, [certificateID]: e?.message || "Failed to load upload audit log." }));
    } finally {
      setUploadAuditLoadingByCertificate(prev => ({ ...prev, [certificateID]: false }));
    }
  }, [api]);

  const handleCertCreate = async (form) => {
    setSubmitting(true);
    try {
      const payload = { ...form, issue_date: new Date(form.issue_date).toISOString(), expiry_date: new Date(form.expiry_date).toISOString() };
      await api.post("/addcertificate", payload);
      setCertModal(null);
      setCertificatesByComponent(prev => { const n = { ...prev }; delete n[selectedComponentId]; return n; });
      loadCertificatesForComponent(selectedComponentId);
    } catch (e) {
      // error already toasted by api layer
    } finally {
      setSubmitting(false);
    }
  };

  const componentsForAsset = useMemo(
    () => data.filter(c => c.asset_id === selectedAssetId),
    [data, selectedAssetId]
  );

  useEffect(() => {
    if (!selectedAssetId) return;
    if (componentsForAsset.length === 0) {
      setSelectedComponentId("");
      return;
    }
    const exists = componentsForAsset.some(c => c.component_id === selectedComponentId);
    if (!exists) {
      const preferred = initialComponentId && componentsForAsset.some(c => c.component_id === initialComponentId)
        ? initialComponentId
        : componentsForAsset[0].component_id;
      setSelectedComponentId(preferred);
      setExpandedCertId(null);
    }
  }, [selectedAssetId, componentsForAsset, selectedComponentId, initialComponentId]);

  useEffect(() => {
    if (!selectedComponentId) return;
    if (!certificatesByComponent[selectedComponentId] && !certificatesLoadingByComponent[selectedComponentId]) {
      loadCertificatesForComponent(selectedComponentId);
    }
  }, [selectedComponentId, certificatesByComponent, certificatesLoadingByComponent, loadCertificatesForComponent]);

  useEffect(() => {
    if (componentsForAsset.length === 0) return;
    componentsForAsset.forEach(c => {
      if (!certificatesByComponent[c.component_id] && !certificatesLoadingByComponent[c.component_id]) {
        loadCertificatesForComponent(c.component_id);
      }
    });
  }, [componentsForAsset, certificatesByComponent, certificatesLoadingByComponent, loadCertificatesForComponent]);

  const selectedAsset = useMemo(
    () => assets.find(a => a.asset_id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );

  const selectedComponent = useMemo(
    () => componentsForAsset.find(c => c.component_id === selectedComponentId) || null,
    [componentsForAsset, selectedComponentId]
  );

  const currentCertificates = useMemo(
    () => certificatesByComponent[selectedComponentId] || [],
    [certificatesByComponent, selectedComponentId]
  );

  // Load audit for ALL certificates of this component
  useEffect(() => {
    currentCertificates.forEach(cert => {
      const certID = cert.certificate_id;
      if (!certID) return;
      if (!uploadAuditByCertificate[certID] && !uploadAuditLoadingByCertificate[certID]) {
        loadCertificateUploadAudit(certID);
      }
    });
    // Auto-expand first cert if nothing is expanded yet
    if (currentCertificates.length > 0 && !expandedCertId) {
      setExpandedCertId(currentCertificates[0].certificate_id);
    }
  }, [currentCertificates, uploadAuditByCertificate, uploadAuditLoadingByCertificate, loadCertificateUploadAudit]);

  const getComponentBadge = useCallback((componentID) => {
    const certs = certificatesByComponent[componentID] || [];
    const latest = certs[0];
    if (!latest) return { label: "No Cert", cls: "dim" };
    if (latest.status === "EXPIRED") return { label: "Expired", cls: "red" };
    if (latest.status === "EXPIRING_SOON") return { label: "Due Soon", cls: "amber" };
    if (latest.status === "VALID") return { label: "OK", cls: "green" };
    return { label: "No Cert", cls: "dim" };
  }, [certificatesByComponent]);

  const expiryToneClass = useCallback((cert) => {
    if (!cert?.expiry_date) return "";
    const expiryDate = new Date(cert.expiry_date);
    if (Number.isNaN(expiryDate.getTime())) return "";
    const days = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return "expired";
    if (days <= 30) return "warning";
    return "";
  }, []);

  const viewCertificateFile = useCallback(async (certificateID) => {
    try {
      const res = await api.get(`/certificate/${certificateID}/file`);
      if (res?.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      } else {
        notifyError("Certificate file URL is not available.");
      }
    } catch (e) {
      notifyError(e?.message || "Failed to open certificate file.");
    }
  }, [api, notifyError]);

  const uploadCertificateFile = useCallback(async (componentID, certificateID, file) => {
    if (!file) return;

    if (!user?.token) {
      notifyError("Your session has expired. Please sign in again.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setUploadBusyByCertificate(prev => ({ ...prev, [certificateID]: true }));
    try {
      const response = await fetch(`${BASE}/certificate/${certificateID}/file`, {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}` },
        body: formData,
      });

      let payload = null;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || `Upload failed (${response.status})`);
      }

      notifyInfo(payload?.message || "Certificate file uploaded.");
      await Promise.all([
        loadCertificatesForComponent(componentID),
        loadCertificateUploadAudit(certificateID),
      ]);
    } catch (e) {
      notifyError(e?.message || "Failed to upload certificate file.");
    } finally {
      setUploadBusyByCertificate(prev => ({ ...prev, [certificateID]: false }));
    }
  }, [user?.token, notifyError, notifyInfo, loadCertificatesForComponent, loadCertificateUploadAudit]);

  const handleCertificateUploadClick = useCallback((componentID, certificateID) => {
    if (!isAdmin) return;
    if (!certificateID) {
      notifyError("No certificate record found for this component.");
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,image/jpeg,image/png,image/webp";
    input.onchange = () => {
      const selectedFile = input.files?.[0];
      if (selectedFile) uploadCertificateFile(componentID, certificateID, selectedFile);
    };
    input.click();
  }, [isAdmin, uploadCertificateFile, notifyError]);

  return (
    <div className="fade-in">
      <PageHeader
        title="Components"
        subtitle={selectedAsset ? `${componentsForAsset.length || 0} components in ${selectedAsset.name}` : "Select an asset"}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={onBackToAssets}>All Assets</Button>
            {isAdmin && <Button variant="primary" onClick={() => setModal("create")}>+ New Component</Button>}
          </div>
        }
      />
      {loading && <Card style={{ padding: 20, color: "var(--text-2)", fontSize: 12 }}>Loading components...</Card>}
      {!loading && (
        <div className="comp-layout">
          <aside className="comp-nav">
            <div className="comp-nav-hero">
              <div className="comp-nav-title">{selectedAsset?.name || "No Asset"}</div>
              <div className="comp-nav-tags">
                <span className="comp-nav-tag">{selectedAsset?.status || "N/A"}</span>
                {selectedAsset?.location && <span className="comp-nav-tag">{selectedAsset.location}</span>}
                {selectedAsset?.assigned_project && <span className="comp-nav-tag">{selectedAsset.assigned_project}</span>}
              </div>
            </div>
            <div className="comp-nav-list">
              {componentsForAsset.map(component => {
                const badge = getComponentBadge(component.component_id);
                return (
                  <button key={component.component_id} className={`comp-nav-item ${selectedComponentId === component.component_id ? "active" : ""}`} onClick={() => setSelectedComponentId(component.component_id)}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{component.name}</span>
                    <span className={`comp-badge ${badge.cls}`}>{badge.label}</span>
                  </button>
                );
              })}
              {componentsForAsset.length === 0 && <div style={{ padding: "10px 14px", color: "var(--text-2)", fontSize: 12 }}>No components in this asset.</div>}
            </div>
          </aside>

          <section className="comp-content">
            {certificatesErrorByComponent[selectedComponentId] && (
              <Card style={{ padding: 10, color: "var(--red)", fontSize: 11 }}>
                {certificatesErrorByComponent[selectedComponentId]}
              </Card>
            )}
            {!selectedComponent && <Card style={{ padding: 18, color: "var(--text-2)", fontSize: 12 }}>Select a component from the left pane.</Card>}
            {selectedComponent && (
              <>
                <div className="comp-head">
                  <div>
                    <div className="comp-head-title">{selectedComponent.name}</div>
                    <div className="comp-head-sub">{selectedComponent.manufacturer || "Unknown manufacturer"} · {selectedComponent.model || "Unknown model"} · {selectedComponent.class || "No class"}</div>
                  </div>
                  {isAdmin && <div style={{ display: "flex", gap: 8 }}>
                    <Button variant="primary" onClick={() => setCertModal("add")}>+ Add Certificate</Button>
                    <Button onClick={() => { setSelected(selectedComponent); setModal("edit"); }}>Edit Component</Button>
                    <Button variant="danger" onClick={() => handleDelete(selectedComponent.component_id, true)}>Delete</Button>
                  </div>}
                </div>

                <div className="comp-meta">
                  <div className="comp-meta-cell"><div className="comp-meta-label">Component ID</div><div className="comp-meta-value">{selectedComponent.component_id}</div></div>
                  <div className="comp-meta-cell"><div className="comp-meta-label">Serial</div><div className="comp-meta-value">{selectedComponent.serial_number || "—"}</div></div>
                  <div className="comp-meta-cell"><div className="comp-meta-label">Safety Critical</div><div className="comp-meta-value">{selectedComponent.safety_critical || "—"}</div></div>
                  <div className="comp-meta-cell"><div className="comp-meta-label">Equipment Type</div><div className="comp-meta-value">{selectedComponent.equipment_type || "—"}</div></div>
                  <div className="comp-meta-cell"><div className="comp-meta-label">Structure</div><div className="comp-meta-value">{selectedComponent.structure || "—"}</div></div>
                  <div className="comp-meta-cell"><div className="comp-meta-label">Last Inspection</div><div className="comp-meta-value warning">{currentCertificates[0] ? formatDate(currentCertificates[0].issue_date) : "—"}</div></div>
                </div>

                {certificatesLoadingByComponent[selectedComponentId] && (
                  <Card style={{ padding: 12, color: "var(--text-2)", fontSize: 12 }}>Loading certificates...</Card>
                )}

                {!certificatesLoadingByComponent[selectedComponentId] && currentCertificates.length === 0 && (
                  <Card style={{ padding: 18, color: "var(--text-2)", fontSize: 12, textAlign: "center" }}>
                    No certificates linked to this component.
                    {isAdmin && <span> Use <strong>+ Add Certificate</strong> above to add one.</span>}
                  </Card>
                )}

                {currentCertificates.length > 0 && (
                  <div className="cert-editorial-card">
                    {currentCertificates.map((cert, idx) => {
                      const isOpen = expandedCertId === cert.certificate_id;
                      return (
                        <div key={cert.certificate_id} style={{ borderBottom: idx < currentCertificates.length - 1 ? "1px solid var(--border)" : "none" }}>
                          {/* Accordion header — always visible */}
                          <div
                            className="cert-editorial-header"
                            style={{ cursor: "pointer", userSelect: "none" }}
                            onClick={() => setExpandedCertId(isOpen ? null : cert.certificate_id)}
                          >
                            <span style={{
                              fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "1px",
                              textTransform: "uppercase", padding: "1px 6px", borderRadius: 2,
                              border: "1px solid", marginRight: 6,
                              ...(cert.status === "EXPIRED" ? { color: "var(--red)", borderColor: "var(--red-border)", background: "var(--red-bg)" }
                                : cert.status === "EXPIRING_SOON" ? { color: "var(--amber)", borderColor: "var(--amber-border)", background: "var(--amber-bg)" }
                                : { color: "var(--green)", borderColor: "var(--green-border)", background: "var(--green-bg)" })
                            }}>{cert.status || "VALID"}</span>
                            <span className="cert-editorial-title" style={{ flex: 1 }}>
                              {cert.certificate_name || "Unnamed Certificate"}
                              <span style={{ fontSize: 11, color: "rgba(240,232,216,0.45)", fontFamily: "var(--font-sans)", marginLeft: 8 }}>
                                · expires {formatDate(cert.expiry_date)}
                              </span>
                            </span>
                            {isAdmin && (
                              <button
                                className="btn-upload-editorial"
                                onClick={e => { e.stopPropagation(); handleCertificateUploadClick(selectedComponent.component_id, cert.certificate_id); }}
                                disabled={!!uploadBusyByCertificate[cert.certificate_id]}
                              >
                                {uploadBusyByCertificate[cert.certificate_id] ? "Uploading..." : "Upload File"}
                              </button>
                            )}
                            <button
                              className="btn-view-editorial"
                              onClick={e => { e.stopPropagation(); viewCertificateFile(cert.certificate_id); }}
                              disabled={!cert.certificate_file}
                            >View File</button>
                            <span style={{ color: "rgba(240,232,216,0.45)", fontSize: 14, marginLeft: 8, transition: "transform 0.25s", display: "inline-block", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
                          </div>

                          {/* Accordion body — slides open/closed */}
                          <div className={`cert-accordion-body${isOpen ? " open" : ""}`}>
                            <div className="cert-accordion-inner">
                              <div className="cert-editorial-fields">
                                <div className="cert-editorial-row"><div className="cert-editorial-label">Issued By</div><div className="cert-editorial-value">{cert.issuing_authority || "—"}</div></div>
                                <div className="cert-editorial-row"><div className="cert-editorial-label">Certificate No.</div><div className="cert-editorial-value">{cert.certificate_id || "—"}</div></div>
                                <div className="cert-editorial-row"><div className="cert-editorial-label">Issue Date</div><div className="cert-editorial-value">{formatDate(cert.issue_date)}</div></div>
                                <div className="cert-editorial-row"><div className="cert-editorial-label">Expiry Date</div><div className={`cert-editorial-value ${expiryToneClass(cert)}`}>{formatDate(cert.expiry_date)}</div></div>
                                <div className="cert-editorial-row"><div className="cert-editorial-label">File</div><div className="cert-editorial-value">{cert.certificate_file || "No file linked."}</div></div>
                              </div>
                              <div className="audit-editorial">
                                <div className="audit-editorial-head"><span className="audit-editorial-title">Upload history</span><span className="audit-editorial-count">{(uploadAuditByCertificate[cert.certificate_id] || []).length} entries</span></div>
                                {uploadAuditLoadingByCertificate[cert.certificate_id] && <div style={{ padding: "10px 16px", fontSize: 11, color: "var(--text-2)" }}>Loading audit log...</div>}
                                {uploadAuditErrorByCertificate[cert.certificate_id] && <div style={{ padding: "10px 16px", fontSize: 11, color: "var(--red)" }}>{uploadAuditErrorByCertificate[cert.certificate_id]}</div>}
                                {!uploadAuditLoadingByCertificate[cert.certificate_id] && !uploadAuditErrorByCertificate[cert.certificate_id] && (
                                  <table className="audit-editorial-table">
                                    <thead><tr><th>Date & Time</th><th>User</th><th>Action</th><th>File</th></tr></thead>
                                    <tbody>
                                      {(uploadAuditByCertificate[cert.certificate_id] || []).map((entry, i) => (
                                        <tr key={`${entry.uploaded_at || "u"}-${i}`}>
                                          <td className="audit-mono">{entry.uploaded_at ? new Date(entry.uploaded_at).toLocaleString() : "—"}</td>
                                          <td>{entry.uploaded_by || "Unknown"}</td>
                                          <td><span className="audit-dot" /><span className="audit-pill">Uploaded</span></td>
                                          <td className="audit-mono">{entry.file_name || entry.file_key || "(unknown file)"}</td>
                                        </tr>
                                      ))}
                                      {(uploadAuditByCertificate[cert.certificate_id] || []).length === 0 && <tr><td colSpan={4} style={{ color: "var(--text-2)" }}>No upload history recorded yet.</td></tr>}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
      {modal === "create" && <Modal title="New Component" onClose={() => setModal(null)} width={640}>
        <ComponentForm
          initial={selectedAssetId ? { asset_id: selectedAssetId, safety_critical: "NO" } : undefined}
          assets={assets}
          categories={categories}
          onSubmit={handleCreate}
          onClose={() => setModal(null)}
          submitting={submitting}
        />
      </Modal>}
      {modal === "edit" && selected && <Modal title="Edit Component" onClose={() => { setModal(null); setSelected(null); }} width={640}>
        <ComponentForm initial={selected} assets={assets} categories={categories} onSubmit={handleUpdate} onClose={() => { setModal(null); setSelected(null); }} submitting={submitting} />
      </Modal>}
      {certModal === "add" && selectedComponent && (
        <Modal title={`Add Certificate — ${selectedComponent.name}`} onClose={() => setCertModal(null)} width={620}>
          <CertificateForm
            initial={{ component_id: selectedComponentId, certificate_name: "", issue_date: "", expiry_date: "", issuing_authority: "", test_id: "", imca_ref: "", imca_d018: "", maintenance_notes: "" }}
            components={data}
            testTypes={testTypes}
            onSubmit={handleCertCreate}
            onClose={() => setCertModal(null)}
            submitting={submitting}
          />
        </Modal>
      )}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ CERTIFICATES PAGE Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function CertificateForm({ initial, components, testTypes, onSubmit, onClose, submitting = false }) {
  const [form, setForm] = useState(initial || {
    component_id: "", certificate_name: "", issue_date: "", expiry_date: "",
    issuing_authority: "", test_id: "", imca_ref: "", imca_d018: "", maintenance_notes: ""
  });
  const componentOptions = useMemo(
    () => components.map(c => ({ value: c.component_id, label: c.name })),
    [components]
  );
  const testTypeOptions = useMemo(
    () => testTypes.map(t => ({ value: t.test_id, label: t.test_name })),
    [testTypes]
  );
  const f = (k) => (v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Component" value={form.component_id} onChange={f("component_id")} options={componentOptions} required />
        <Input label="Test Type" value={form.test_id} onChange={f("test_id")} options={testTypeOptions} required />
      </div>
      <Input label="Certificate Name" value={form.certificate_name} onChange={f("certificate_name")} required />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Issue Date" type="date" value={form.issue_date} onChange={f("issue_date")} required />
        <Input label="Expiry Date" type="date" value={form.expiry_date} onChange={f("expiry_date")} required />
      </div>
      <Input label="Issuing Authority" value={form.issuing_authority} onChange={f("issuing_authority")} required />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="IMCA Ref" value={form.imca_ref} onChange={f("imca_ref")} />
        <Input label="IMCA D018" value={form.imca_d018} onChange={f("imca_d018")} />
      </div>
      <Input label="Maintenance Notes" type="textarea" value={form.maintenance_notes} onChange={f("maintenance_notes")} />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="primary" onClick={() => onSubmit(form)} disabled={submitting}>
          {submitting ? "Saving..." : "Save Certificate"}
        </Button>
      </div>
    </div>
  );
}

function CertificatesPage() {
  const api = useApi();
  const { isAdmin } = useAuth();
  const confirmAction = useConfirm();
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [components, setComponents] = useState([]);
  const [testTypes, setTestTypes] = useState([]);

  const deriveStatusFromExpiry = useCallback((expiryDateValue) => {
    if (!expiryDateValue) return "VALID";
    const parsed = new Date(expiryDateValue);
    if (Number.isNaN(parsed.getTime())) return "VALID";
    const days = Math.floor((parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return "EXPIRED";
    if (days <= 30) return "EXPIRING_SOON";
    return "VALID";
  }, []);

  const load = useCallback(async (p = 1, opts = { silent: false, signal: null }) => {
    if (opts.silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.get(`/certificates?page=${p}&limit=20`, { signal: opts.signal });
      if (opts.signal?.aborted) return;
      setData(res.data || []); setMeta(res.meta);
    } catch (e) {
      if (e?.name !== "AbortError") throw e;
    } finally {
      if (!opts.signal?.aborted) {
        if (opts.silent) setRefreshing(false);
        else setLoading(false);
      }
    }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load(page, { signal: controller.signal });
    return () => controller.abort();
  }, [page, load]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api.get("/components?limit=200", { signal: controller.signal }),
      api.get("/test-types", { signal: controller.signal }),
    ]).then(([componentsRes, testTypesRes]) => {
      if (controller.signal.aborted) return;
      setComponents(componentsRes?.data || []);
      setTestTypes(testTypesRes?.data || testTypesRes || []);
    }).catch((e) => {
      if (e?.name !== "AbortError") console.error(e);
    });
    return () => controller.abort();
  }, [api]);

  const handleCreate = async (form) => {
    setActionError("");
    setSubmitting(true);
    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      certificate_id: tempId,
      component_id: form.component_id,
      certificate_name: form.certificate_name,
      issuing_authority: form.issuing_authority,
      expiry_date: new Date(form.expiry_date).toISOString(),
      status: deriveStatusFromExpiry(form.expiry_date),
    };

    // Close immediately so the action feels responsive.
    setModal(null);
    setData(prev => [optimistic, ...prev.filter(r => r.certificate_id !== tempId)].slice(0, 20));
    setMeta(prev => prev
      ? { ...prev, total: (prev.total || 0) + 1 }
      : { page, total_pages: 1, total: 1 }
    );

    try {
      const payload = { ...form, issue_date: new Date(form.issue_date).toISOString(), expiry_date: new Date(form.expiry_date).toISOString() };
      const created = await api.post("/addcertificate", payload);
      setData(prev => [created, ...prev.filter(r => r.certificate_id !== tempId && r.certificate_id !== created?.certificate_id)].slice(0, 20));
    } catch (e) {
      setData(prev => prev.filter(r => r.certificate_id !== tempId));
      setMeta(prev => prev ? { ...prev, total: Math.max(0, (prev.total || 1) - 1) } : prev);
      setActionError(e?.message || "Failed to add certificate.");
    } finally {
      setSubmitting(false);
      load(page, { silent: true });
    }
  };
  const handleUpdate = async (form) => {
    setActionError("");
    setSubmitting(true);
    try {
      const payload = { ...form, issue_date: new Date(form.issue_date).toISOString(), expiry_date: new Date(form.expiry_date).toISOString() };
      await api.put(`/updatecertificate/${selected.certificate_id}`, payload);
      setModal(null);
      load(page, { silent: true });
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async (id) => {
    setActionError("");
    if (!(await confirmAction("Delete this certificate?"))) return;
    try {
      await api.del(`/deletecertificate/${id}`);
      load(page, { silent: true });
    } catch (e) {
      setActionError(e?.message || "Failed to delete certificate.");
    }
  };

  return (
    <div className="fade-in">
      <PageHeader title="Certificates" subtitle={`${meta?.total || 0} compliance certificates`}
        action={isAdmin && <Button variant="primary" onClick={() => setModal("create")}>+ New Certificate</Button>} />
      {actionError && <div style={{ marginBottom: 10, fontSize: 11, color: "var(--red)" }}>{actionError}</div>}
      {refreshing && <div style={{ marginBottom: 10, fontSize: 11, color: "var(--text-2)" }}>Refreshing list...</div>}
      <Card>
        <Table loading={loading} data={data}
          columns={[
            { key: "certificate_id", label: "ID", render: v => <span style={{ color: "var(--text-2)", fontSize: 11 }}>{v}</span> },
            { key: "certificate_name", label: "Certificate", render: v => <span style={{ fontWeight: 500 }}>{v}</span> },
            { key: "component_id", label: "Component" },
            { key: "issuing_authority", label: "Authority" },
            { key: "expiry_date", label: "Expiry", render: v => <span style={{ fontFamily: "var(--font-mono)" }}>{formatDate(v)}</span> },
            { key: "status", label: "Status", render: v => <StatusBadge status={v} /> },
            isAdmin ? { key: "certificate_id", label: "", render: (v, row) => (
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" onClick={e => { e.stopPropagation(); setSelected(row); setModal("edit"); }}>Edit</Button>
                <Button size="sm" variant="danger" onClick={e => { e.stopPropagation(); handleDelete(v); }}>Del</Button>
              </div>
            )} : null
          ].filter(Boolean)}
        />
        <Pagination meta={meta} onPage={setPage} />
      </Card>
      {modal === "create" && <Modal title="New Certificate" onClose={() => setModal(null)} width={600}>
        <CertificateForm components={components} testTypes={testTypes} onSubmit={handleCreate} onClose={() => setModal(null)} submitting={submitting} />
      </Modal>}
      {modal === "edit" && selected && <Modal title="Edit Certificate" onClose={() => { setModal(null); setSelected(null); }} width={600}>
        <CertificateForm initial={{ ...selected, issue_date: selected.issue_date?.slice(0,10), expiry_date: selected.expiry_date?.slice(0,10) }} components={components} testTypes={testTypes} onSubmit={handleUpdate} onClose={() => { setModal(null); setSelected(null); }} submitting={submitting} />
      </Modal>}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ CATEGORIES PAGE Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function CertificateDetailsPage({ certificateId, onBack }) {
  const api = useApi();
  const [certificate, setCertificate] = useState(null);
  const [testTypes, setTestTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!certificateId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api.get(`/certificate/${certificateId}`, { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        setCertificate(res || null);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setError(e?.message || "Failed to load certificate.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, certificateId]);

  useEffect(() => {
    const controller = new AbortController();
    api.get("/test-types", { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        setTestTypes(res?.data || res || []);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") console.error(e);
      });
    return () => controller.abort();
  }, [api]);

  const testTypeName = useMemo(() => {
    if (!certificate?.test_id) return "-";
    const found = testTypes.find(t => t.test_id === certificate.test_id);
    return found?.test_name || certificate.test_id;
  }, [certificate?.test_id, testTypes]);

  const details = [
    { label: "Certificate ID", value: certificate?.certificate_id },
    { label: "Component ID", value: certificate?.component_id },
    { label: "Test Type ID", value: certificate?.test_id },
    { label: "Issue Date", value: formatDate(certificate?.issue_date) },
    { label: "Expiry Date", value: formatDate(certificate?.expiry_date) },
    { label: "Issuing Authority", value: certificate?.issuing_authority },
    { label: "IMCA Ref", value: certificate?.imca_ref },
    { label: "IMCA D018", value: certificate?.imca_d018 },
    { label: "Certificate File", value: certificate?.certificate_file },
    { label: "Created At", value: formatDate(certificate?.created_at) },
    { label: "Updated At", value: formatDate(certificate?.updated_at) },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        title={certificate?.certificate_name || "Certificate Details"}
        subtitle={certificateId ? `Record: ${certificateId}` : "No certificate selected"}
        action={<Button onClick={onBack}>Back to Components</Button>}
      />
      {loading && (
        <Card style={{ padding: 16, color: "var(--text-2)", fontSize: 12 }}>Loading certificate...</Card>
      )}
      {!loading && error && (
        <Card style={{ padding: 16, color: "var(--red)", fontSize: 12 }}>{error}</Card>
      )}
      {!loading && !error && certificate && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card style={{ padding: 18, borderColor: "var(--border-bright)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                  Test Type
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 26, lineHeight: 1.2 }}>
                  {testTypeName}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-1)" }}>
                  {certificate?.certificate_name || "-"}
                </div>
              </div>
              <div style={{ justifySelf: "end", minWidth: 180, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                <div style={{ fontSize: 10, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Certificate Status
                </div>
                <StatusBadge status={certificate?.status || "VALID"} />
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--text-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Certificate Details
            </div>
            <div style={{ padding: "6px 14px 10px" }}>
              {details.map((item) => (
                <div key={item.label} style={{
                  display: "grid",
                  gridTemplateColumns: "220px minmax(0, 1fr)",
                  gap: 12,
                  padding: "11px 0",
                  borderBottom: "1px solid var(--border)",
                }}>
                  <div style={{ fontSize: 10, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-0)", wordBreak: "break-word" }}>
                    {item.value || "-"}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--text-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Maintenance Notes
            </div>
            <div style={{ padding: "14px", fontSize: 13, lineHeight: 1.55, color: "var(--text-0)", minHeight: 90, whiteSpace: "pre-wrap" }}>
              {certificate?.maintenance_notes || "-"}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function CategoriesPage() {
  const api = useApi();
  const { isAdmin } = useAuth();
  const confirmAction = useConfirm();
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ category_name: "", description: "" });

  const load = useCallback(async (p = 1, opts = {}) => {
    setLoading(true);
    try {
      const res = await api.get(`/categories?page=${p}&limit=20`, { signal: opts.signal });
      if (opts.signal?.aborted) return;
      setData(res.data || []); setMeta(res.meta);
    } catch (e) {
      if (e?.name !== "AbortError") throw e;
    } finally { if (!opts.signal?.aborted) setLoading(false); }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load(page, { signal: controller.signal });
    return () => controller.abort();
  }, [page, load]);

  const openCreate = () => { setForm({ category_name: "", description: "" }); setModal("create"); };
  const openEdit = (row) => { setSelected(row); setForm({ category_name: row.category_name, description: row.description }); setModal("edit"); };
  const handleSave = async () => {
    setSubmitting(true);
    try {
      if (modal === "create") await api.post("/addcategory", form);
      else await api.put(`/updatecategory/${selected.category_id}`, form);
      setModal(null);
      load(page);
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async (id) => {
    if (!(await confirmAction("Delete this category?"))) return;
    await api.del(`/deletecategory/${id}`);
    load(page);
  };

  return (
    <div className="fade-in">
      <PageHeader title="Categories" subtitle="Component classification taxonomy"
        action={isAdmin && <Button variant="primary" onClick={openCreate}>+ New Category</Button>} />
      <Card>
        <Table loading={loading} data={data}
          columns={[
            { key: "category_id", label: "ID", render: v => <span style={{ color: "var(--text-2)" }}>{v ? `${v.slice(0,8)}…` : "—"}</span> },
            { key: "category_name", label: "Name", render: v => <span style={{ fontWeight: 500 }}>{v}</span> },
            { key: "description", label: "Description" },
            { key: "created_at", label: "Created", render: v => formatDate(v) },
            isAdmin ? { key: "category_id", label: "", render: (v, row) => (
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" onClick={e => { e.stopPropagation(); openEdit(row); }}>Edit</Button>
                <Button size="sm" variant="danger" onClick={e => { e.stopPropagation(); handleDelete(v); }}>Del</Button>
              </div>
            )} : null
          ].filter(Boolean)}
        />
        <Pagination meta={meta} onPage={setPage} />
      </Card>
      {modal && <Modal title={modal === "create" ? "New Category" : "Edit Category"} onClose={() => setModal(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Category Name" value={form.category_name} onChange={v => setForm(p => ({ ...p, category_name: v }))} required />
          <Input label="Description" type="textarea" value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button onClick={() => setModal(null)} disabled={submitting}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Modal>}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ TEST TYPES PAGE Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function TestTypesPage() {
  const api = useApi();
  const { isAdmin } = useAuth();
  const confirmAction = useConfirm();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ test_id: "", test_name: "", validity_duration: "", description: "" });

  const load = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const res = await api.get("/test-types", { signal: opts.signal });
      if (opts.signal?.aborted) return;
      setData(res?.data || res || []);
    } catch (e) {
      if (e?.name !== "AbortError") throw e;
    } finally { if (!opts.signal?.aborted) setLoading(false); }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  const openCreate = () => { setForm({ test_id: "", test_name: "", validity_duration: "", description: "" }); setModal("create"); };
  const openEdit = (row) => { setSelected(row); setForm({ test_id: row.test_id, test_name: row.test_name, validity_duration: row.validity_duration, description: row.description }); setModal("edit"); };
  const handleSave = async () => {
    const payload = { ...form, validity_duration: parseInt(form.validity_duration) };
    setSubmitting(true);
    try {
      if (modal === "create") await api.post("/addtesttype", payload);
      else await api.put(`/updatetesttype/${selected.test_id}`, payload);
      setModal(null);
      load();
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async (id) => {
    if (!(await confirmAction("Delete this test type?"))) return;
    await api.del(`/deletetesttype/${id}`);
    load();
  };

  return (
    <div className="fade-in">
      <PageHeader title="Test Types" subtitle="Certificate test type definitions"
        action={isAdmin && <Button variant="primary" onClick={openCreate}>+ New Test Type</Button>} />
      <Card>
        <Table loading={loading} data={data}
          columns={[
            { key: "test_id", label: "ID", render: v => <span style={{ color: "var(--text-2)" }}>{v}</span> },
            { key: "test_name", label: "Name", render: v => <span style={{ fontWeight: 500 }}>{v}</span> },
            { key: "validity_duration", label: "Validity (days)", render: v => <span style={{ color: "var(--amber)" }}>{v}d</span> },
            { key: "description", label: "Description" },
            isAdmin ? { key: "test_id", label: "", render: (v, row) => (
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" onClick={e => { e.stopPropagation(); openEdit(row); }}>Edit</Button>
                <Button size="sm" variant="danger" onClick={e => { e.stopPropagation(); handleDelete(v); }}>Del</Button>
              </div>
            )} : null
          ].filter(Boolean)}
        />
      </Card>
      {modal && <Modal title={modal === "create" ? "New Test Type" : "Edit Test Type"} onClose={() => setModal(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {modal === "create" && <Input label="Test ID" value={form.test_id} onChange={v => setForm(p => ({ ...p, test_id: v }))} required />}
          <Input label="Test Name" value={form.test_name} onChange={v => setForm(p => ({ ...p, test_name: v }))} required />
          <Input label="Validity Duration (days)" type="number" value={String(form.validity_duration)} onChange={v => setForm(p => ({ ...p, validity_duration: v }))} required />
          <Input label="Description" type="textarea" value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button onClick={() => setModal(null)} disabled={submitting}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Modal>}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ USERS PAGE Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function UsersPage() {
  const api = useApi();
  const confirmAction = useConfirm();
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", password: "", role: "USER" });

  const load = useCallback(async (p = 1, opts = {}) => {
    setLoading(true);
    try {
      const res = await api.get(`/users?page=${p}&limit=20`, { signal: opts.signal });
      if (opts.signal?.aborted) return;
      setData(res.data || []); setMeta(res.meta);
    } catch (e) {
      if (e?.name !== "AbortError") throw e;
    } finally { if (!opts.signal?.aborted) setLoading(false); }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    load(page, { signal: controller.signal });
    return () => controller.abort();
  }, [page, load]);

  const openCreate = () => { setForm({ first_name: "", last_name: "", email: "", password: "", role: "USER" }); setModal("create"); };
  const openEdit = (row) => { setSelected(row); setForm({ first_name: row.first_name, last_name: row.last_name, email: row.email, role: row.role }); setModal("edit"); };
  const handleSave = async () => {
    setSubmitting(true);
    try {
      if (modal === "create") await api.post("/register", form);
      else await api.put(`/updateuser/${selected.user_id}`, form);
      setModal(null);
      load(page);
    } finally {
      setSubmitting(false);
    }
  };
  const handleDelete = async (id) => {
    if (!(await confirmAction("Delete this user?"))) return;
    await api.del(`/deleteuser/${id}`);
    load(page);
  };

  return (
    <div className="fade-in">
      <PageHeader title="Users" subtitle={`${meta?.total || 0} system users`}
        action={<Button variant="primary" onClick={openCreate}>+ Register User</Button>} />
      <Card>
        <Table loading={loading} data={data}
          columns={[
            { key: "user_id", label: "ID", render: v => <span style={{ color: "var(--text-2)", fontSize: 11 }}>{v ? `${v.slice(0,8)}…` : "—"}</span> },
            { key: "first_name", label: "First Name" },
            { key: "last_name", label: "Last Name" },
            { key: "email", label: "Email" },
            { key: "role", label: "Role", render: v => <StatusBadge status={v} /> },
            { key: "created_at", label: "Joined", render: v => formatDate(v) },
            { key: "user_id", label: "", render: (v, row) => (
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" onClick={e => { e.stopPropagation(); openEdit(row); }}>Edit</Button>
                <Button size="sm" variant="danger" onClick={e => { e.stopPropagation(); handleDelete(v); }}>Del</Button>
              </div>
            )}
          ]}
        />
        <Pagination meta={meta} onPage={setPage} />
      </Card>
      {modal && <Modal title={modal === "create" ? "Register User" : "Edit User"} onClose={() => setModal(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Input label="First Name" value={form.first_name} onChange={v => setForm(p => ({ ...p, first_name: v }))} required />
            <Input label="Last Name" value={form.last_name} onChange={v => setForm(p => ({ ...p, last_name: v }))} required />
          </div>
          <Input label="Email" type="email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} required />
          {modal === "create" && <Input label="Password" type="password" value={form.password} onChange={v => setForm(p => ({ ...p, password: v }))} required />}
          <Input label="Role" value={form.role} onChange={v => setForm(p => ({ ...p, role: v }))} options={[{value:"ADMIN",label:"Admin"},{value:"USER",label:"User"}]} required />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button onClick={() => setModal(null)} disabled={submitting}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={submitting}>
              {submitting ? "Saving..." : (modal === "create" ? "Register" : "Save")}
            </Button>
          </div>
        </div>
      </Modal>}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ APP SHELL Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function AppShell() {
  const [page, setPage] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("page") || "dashboard";
  });
  const [selectedAssetId, setSelectedAssetId] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("assetId") || "";
  });
  const [initialComponentId, setInitialComponentId] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("componentId") || "";
  });

  const navigate = useCallback((newPage, newAssetId = "", newComponentId = "") => {
    const params = new URLSearchParams();
    params.set("page", newPage);
    if (newAssetId) params.set("assetId", newAssetId);
    if (newComponentId) params.set("componentId", newComponentId);
    window.history.pushState({ page: newPage, assetId: newAssetId, componentId: newComponentId }, "", `?${params.toString()}`);
    setPage(newPage);
    setSelectedAssetId(newAssetId);
    setInitialComponentId(newComponentId);
  }, []);

  useEffect(() => {
    const onPop = (e) => {
      const state = e.state || {};
      const sp = new URLSearchParams(window.location.search);
      setPage(state.page || sp.get("page") || "dashboard");
      setSelectedAssetId(state.assetId || sp.get("assetId") || "");
      setInitialComponentId(state.componentId || sp.get("componentId") || "");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const topPage = ["users", "assets"].includes(page) ? page : "dashboard";

  const pages = {
    dashboard: <Dashboard
      onOpenAsset={(assetID) => navigate("components", assetID)}
      onOpenComponent={(assetID, componentID) => navigate("components", assetID, componentID)}
    />,
    assets: <AssetsPage />,
    components: <ComponentsPage selectedAssetId={selectedAssetId} initialComponentId={initialComponentId} onBackToAssets={() => navigate("dashboard")} />,
    users: <UsersPage />,
  };

  return (
    <>
      <TopBar active={topPage} onNav={(p) => navigate(p)} />
      <div className="shell">
        <main className="main">
          {pages[page] || pages.dashboard}
        </main>
      </div>
    </>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ ROOT Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
export default function App() {
  return (
    <AuthProvider>
      <AppFeedbackProvider>
        <style>{CSS}</style>
        <Inner />
      </AppFeedbackProvider>
    </AuthProvider>
  );
}

function Inner() {
  const { user } = useAuth();
  return user ? <AppErrorBoundary><AppShell /></AppErrorBoundary> : <LoginPage />;
}