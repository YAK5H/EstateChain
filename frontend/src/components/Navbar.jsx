
import { shortAddress } from "../lib/format.js";
import { Link } from "react-router-dom";

function NetworkPill({ status }) {
  const styles = {
    checking: "bg-stone-200 text-stone-700",
    sepolia: "bg-emerald-100 text-emerald-900",
    wrong: "bg-amber-100 text-amber-950",
    unavailable: "bg-stone-200 text-stone-700",
  };

  const labels = {
    checking: "Checking network",
    sepolia: "Sepolia",
    wrong: "Not on Sepolia",
    unavailable: "Wallet not found",
  };

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${styles[status] || styles.checking}`}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "sepolia"
            ? "bg-emerald-600"
            : status === "wrong"
              ? "bg-amber-600"
              : "bg-stone-500"
        }`}
        aria-hidden="true"
      />
      {labels[status] || labels.checking}
    </span>
  );
}

export default function Navbar({
  account,
  networkStatus,
  connecting,
  switching,
  walletError,
  isAdmin,
  onConnect,
  onSwitchNetwork,
}) {
  const addressLabel = shortAddress(account);

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-[#f4f1ea]/90 backdrop-blur">
      <div className="flex flex-col max-w-6xl gap-4 px-4 py-4 mx-auto sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link to={isAdmin ? "/admin" : "/"} className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#1f3d34] text-[#f6f1e7]">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" aria-hidden="true">
              <path
                d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5.5v-6h-3V21H5a1 1 0 0 1-1-1v-9.5Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </span>

          <span>
            <span className="block font-serif text-xl leading-none tracking-tight text-stone-900">
              EstateChain
            </span>
            <span className="block mt-1 text-xs text-stone-500">
              {isAdmin ? "Platform Control Centre" : "Share marketplace"}
            </span>
          </span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {!isAdmin && (
            <>
              <Link
                to="/portfolio"
                className="rounded-full px-3 py-2 text-sm font-medium text-[#1f3d34] hover:bg-white"
              >
                Portfolio
              </Link>

              <Link
                to="/list-property"
                className="rounded-full px-3 py-2 text-sm font-medium text-[#1f3d34] hover:bg-white"
              >
                List Property
              </Link>
            </>
          )}

          {isAdmin && (
            <Link
              to="/admin"
              className="rounded-full bg-[#1f3d34]/10 px-4 py-2 text-sm font-semibold text-[#1f3d34]"
            >
              Admin Dashboard
            </Link>
          )}

          <NetworkPill status={networkStatus} />

          {networkStatus === "wrong" && (
            <button
              type="button"
              onClick={onSwitchNetwork}
              disabled={switching}
              className="px-3 py-2 text-sm font-medium bg-white border rounded-full border-amber-300 text-amber-950 hover:bg-amber-50 disabled:opacity-60"
            >
              {switching ? "Switching…" : "Switch to Sepolia"}
            </button>
          )}

          <button
            type="button"
            onClick={onConnect}
            disabled={connecting || Boolean(account)}
            title={account || undefined}
            aria-label={account ? `Connected wallet ${account}` : "Connect Wallet"}
            className="rounded-full bg-[#1f3d34] px-4 py-2 text-sm font-medium text-[#f6f1e7] hover:bg-[#173028] disabled:cursor-default disabled:opacity-90"
          >
            {connecting ? "Connecting…" : addressLabel || "Connect Wallet"}
          </button>
        </div>
      </div>

      {walletError && (
        <p className="max-w-6xl px-4 pb-4 mx-auto text-sm text-red-800 sm:px-6" role="alert">
          {walletError}
        </p>
      )}
    </header>
  );
}
