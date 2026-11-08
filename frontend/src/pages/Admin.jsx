import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatEther } from "ethers";
import { getReadOnlyContract } from "../lib/contract.js";
import AdminPropertyList from "../components/AdminPropertyList.jsx";

function compactEth(value) {
  try {
    return `${Number(formatEther(value)).toLocaleString("en-IN", { maximumFractionDigits: 4 })} ETH`;
  } catch {
    return "Unavailable";
  }
}

function StatCard({ label, value, detail }) {
  return (
    <div className="p-5 bg-white border shadow-sm rounded-2xl border-stone-200">
      <p className="text-sm text-stone-500">{label}</p>
      <p className="mt-2 font-serif text-3xl text-[#1f3d34]">{value}</p>
      {detail ? <p className="mt-1 text-xs text-stone-500">{detail}</p> : null}
    </div>
  );
}

export default function Admin({ properties, isAdmin, onRegistered, account, networkStatus }) {
  const [reserveSummary, setReserveSummary] = useState({ status: "loading", reserved: null, surplus: null });
  const items = properties?.items ?? [];

  const stats = useMemo(() => {
    const active = items.filter((property) => property.active).length;
    const outstanding = items.reduce((sum, property) => sum + BigInt(property.minted ?? 0), 0n);
    const remaining = items.reduce((sum, property) => {
      const max = BigInt(property.maxSupply ?? 0);
      const minted = BigInt(property.minted ?? 0);
      return sum + (max > minted ? max - minted : 0n);
    }, 0n);
    return { active, outstanding, remaining };
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    async function loadReserveSummary() {
      try {
        const contract = getReadOnlyContract();
        const [reserved, balance] = await Promise.all([
          contract.totalReservedForBuybacks(),
          contract.runner.getBalance(contract.target),
        ]);
        if (!cancelled) {
          setReserveSummary({ status: "ready", reserved, surplus: balance > reserved ? balance - reserved : 0n });
        }
      } catch {
        if (!cancelled) setReserveSummary({ status: "unavailable", reserved: null, surplus: null });
      }
    }
    loadReserveSummary();
    return () => { cancelled = true; };
  }, [properties]);

  if (!isAdmin) return null;

  return (
    <main className="max-w-6xl px-4 py-8 mx-auto sm:px-6">
      <div className="rounded-3xl bg-[#1f3d34] p-6 text-[#f6f1e7] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d8bd9b]">EstateChain · Control centre</p>
        <div className="flex flex-col justify-between gap-4 mt-3 sm:flex-row sm:items-end">
          <div>
            <h1 className="font-serif text-4xl">Platform overview</h1>
            <p className="max-w-2xl mt-2 text-sm text-stone-200">Monitor the property portfolio, token supply and buyback liquidity from one place.</p>
          </div>
          <Link to="/admin/properties" className="inline-flex w-fit rounded-full bg-[#f6f1e7] px-5 py-3 text-sm font-semibold text-[#1f3d34] hover:bg-white">Manage properties <span aria-hidden="true">→</span></Link>
        </div>
      </div>

      {properties?.status === "error" ? (
        <div className="p-4 mt-6 text-sm text-red-900 border border-red-200 rounded-2xl bg-red-50">{properties.error}</div>
      ) : null}

      <section className="grid gap-4 mt-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total properties" value={properties?.status === "loading" ? "…" : items.length} detail="Registered on this contract" />
        <StatCard label="Active properties" value={stats.active} detail={`${items.length - stats.active} deactivated`} />
        <StatCard label="Outstanding shares" value={stats.outstanding.toLocaleString("en-IN")} detail="Currently minted and held" />
        <StatCard label="Shares remaining" value={stats.remaining.toLocaleString("en-IN")} detail="Maximum supply less outstanding" />
      </section>

      <section className="grid gap-4 mt-4 sm:grid-cols-2">
        <StatCard label="Buyback reserves" value={reserveSummary.status === "ready" ? compactEth(reserveSummary.reserved) : "Unavailable"} detail="ETH ring-fenced for buybacks" />
        <StatCard label="Withdrawable surplus" value={reserveSummary.status === "ready" ? compactEth(reserveSummary.surplus) : "Unavailable"} detail="Contract balance less reserved ETH" />
      </section>

      <section className="mt-8">
        <div className="flex items-end justify-between gap-3 mb-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6240]">Portfolio monitor</p><h2 className="mt-1 font-serif text-2xl">Recently listed properties</h2></div>
          <Link to="/admin/properties" className="text-sm font-semibold text-[#1f3d34] hover:underline">View all</Link>
        </div>
        <AdminPropertyList properties={properties} compact />
      </section>
      <p className="mt-6 text-xs leading-relaxed text-stone-500">Supply figures show current outstanding tokens. Tokens sold and later bought back are burned, so lifetime sales require historical event aggregation. Reserve and surplus figures are unavailable until the deployed contract exposes the buyback accounting functions.</p>
    </main>
  );
}
