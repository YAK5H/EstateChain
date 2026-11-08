
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatEther } from "ethers";
import { getSignerContract } from "../lib/contract.js";

function formatSharePrice(wei) {
  const value = formatEther(wei);

  if (!value.includes(".")) {
    return `${value} ETH`;
  }

  return `${value.replace(/0+$/, "").replace(/\.$/, "")} ETH`;
}

export default function PropertyDetails({
  properties,
  account,
  networkStatus,
  onRetry,
}) {
  const { id } = useParams();

  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [txHash, setTxHash] = useState("");

  // Find the property corresponding to the URL ID.
  const property = properties.items?.find(
    (item) => item.id === Number(id)
  );

  if (properties.status === "loading") {
    return (
      <main className="max-w-6xl px-4 py-20 mx-auto text-center">
        Loading property details from Sepolia...
      </main>
    );
  }

  if (properties.status === "error") {
    return (
      <main className="max-w-6xl px-4 py-20 mx-auto text-center">
        <h2 className="font-serif text-2xl">Could not load property</h2>
        <p className="mt-3 text-sm text-stone-600">
          {properties.error}
        </p>

        <button
          onClick={onRetry}
          className="mt-6 rounded-full bg-[#1f3d34] px-5 py-3 text-sm text-[#f6f1e7]"
        >
          Try again
        </button>
      </main>
    );
  }

  if (!property) {
    return (
      <main className="max-w-6xl px-4 py-20 mx-auto text-center">
        <h2 className="font-serif text-3xl text-stone-900">
          Property not found
        </h2>

        <p className="mt-3 text-stone-600">
          This property does not exist in the EstateChain marketplace.
        </p>

        <Link
          to="/"
          className="inline-block mt-6 rounded-full bg-[#1f3d34] px-5 py-3 text-sm text-[#f6f1e7]"
        >
          Back to Marketplace
        </Link>
      </main>
    );
  }

  const remaining =
    BigInt(property.maxSupply) - BigInt(property.minted);

  const validQuantity = /^[1-9]\d*$/.test(quantity);
  const amount = validQuantity ? BigInt(quantity) : 0n;

  const totalCost =
    BigInt(property.pricePerTokenWei) * amount;

  async function handleBuy() {
    setError("");
    setSuccess("");
    setTxHash("");

    if (networkStatus !== "sepolia") {
      setError("Please connect MetaMask and switch to Sepolia.");
      return;
    }

    if (!validQuantity) {
      setError("Enter a valid whole-number quantity.");
      return;
    }

    if (amount > remaining) {
      setError(`Only ${remaining.toString()} shares are available.`);
      return;
    }

    if (!property.active) {
      setError("This property is currently paused.");
      return;
    }

    if (busy) return;

    setBusy(true);

    try {
      // Connect MetaMask and obtain the writable contract.
      const contract = await getSignerContract();

      // Send the purchase transaction with the required ETH.
      const tx = await contract.buyTokens(
        BigInt(property.id),
        amount,
        { value: totalCost }
      );

      setTxHash(tx.hash);
      setSuccess("Transaction submitted. Waiting for confirmation...");

      const receipt = await tx.wait();

      if (!receipt || receipt.status !== 1) {
        throw new Error("The transaction failed.");
      }

      setSuccess(
        `Successfully purchased ${amount.toString()} share(s)!`
      );

      // Refresh marketplace data after the confirmed purchase.
      try {
        await onRetry?.();
      } catch {
        setSuccess(
          "Purchase confirmed! The marketplace could not refresh. Please reload the page."
        );
      }
    } catch (err) {
      console.error("Purchase failed:", err);

      if (err?.code === 4001 || err?.code === "ACTION_REJECTED") {
        setError("You rejected the transaction in MetaMask.");
      } else if (err?.code === "INSUFFICIENT_FUNDS") {
        setError(
          "Insufficient Sepolia ETH for the purchase and gas fee."
        );
      } else {
        setError(
          err?.shortMessage ||
          err?.reason ||
          err?.message ||
          "Purchase failed. Please try again."
        );
      }

      setSuccess("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-6xl px-4 py-10 mx-auto sm:px-6 sm:py-14">

      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-stone-600 hover:text-[#1f3d34]"
      >
        ← Back to Marketplace
      </Link>

      {/* Property image */}
      <div className="mt-6 overflow-hidden bg-stone-100 rounded-3xl">
        {property.imageUrl ? (
          <img
            src={property.imageUrl}
            alt={property.name}
            className="object-cover w-full max-h-[460px]"
          />
        ) : (
          <div className="grid h-64 place-items-center text-stone-500">
            No property image available
          </div>
        )}
      </div>

      {/* Property information */}
      <div className="grid gap-8 mt-8 lg:grid-cols-[1.5fr_1fr]">

        <section className="space-y-6">
          <div>
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  property.active
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-stone-200 text-stone-700"
                }`}
              >
                {property.active ? "Open for Investment" : "Paused"}
              </span>

              <span className="text-sm text-stone-500">
                Property #{property.id}
              </span>
            </div>

            <h1 className="mt-4 font-serif text-3xl text-stone-900 sm:text-4xl">
              {property.name}
            </h1>

            <p className="mt-2 text-stone-600">
              {property.location}
            </p>
          </div>

          <div>
            <h2 className="font-serif text-2xl text-stone-900">
              Property Overview
            </h2>

            <p className="mt-3 leading-relaxed text-stone-600">
              Explore simulated property shares recorded on the
              Ethereum Sepolia test network. Each share is represented
              by an ERC-20 token deployed for this property.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-white border rounded-2xl border-stone-200">
              <p className="text-sm text-stone-500">Price per share</p>
              <p className="mt-2 font-semibold text-stone-900">
                {formatSharePrice(property.pricePerTokenWei)}
              </p>
            </div>

            <div className="p-4 bg-white border rounded-2xl border-stone-200">
              <p className="text-sm text-stone-500">Total shares</p>
              <p className="mt-2 font-semibold text-stone-900">
                {property.maxSupply.toString()}
              </p>
            </div>

            <div className="p-4 bg-white border rounded-2xl border-stone-200">
              <p className="text-sm text-stone-500">Shares sold</p>
              <p className="mt-2 font-semibold text-stone-900">
                {property.minted.toString()}
              </p>
            </div>

            <div className="p-4 bg-white border rounded-2xl border-stone-200">
              <p className="text-sm text-stone-500">Shares remaining</p>
              <p className="mt-2 font-semibold text-stone-900">
                {remaining.toString()}
              </p>
            </div>
          </div>

          <div className="p-4 bg-white border rounded-2xl border-stone-200">
            <p className="text-sm text-stone-500">
              Property Token Contract
            </p>

            <p className="mt-2 text-sm font-medium break-all text-stone-800">
              {property.token}
            </p>

            <a
              href={`https://sepolia.etherscan.io/address/${property.token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 text-sm text-[#1f3d34] underline"
            >
              View Token on Etherscan ↗
            </a>
          </div>
        </section>

        {/* Buying panel */}
        <aside className="p-6 bg-white border shadow-sm h-fit rounded-3xl border-stone-200">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6240]">
            Purchase Shares
          </p>

          <h2 className="mt-2 font-serif text-2xl text-stone-900">
            Buy Property Tokens
          </h2>

          <p className="mt-2 text-sm text-stone-600">
            Choose how many whole shares you want to purchase.
          </p>

          <div className="mt-6">
            <label
              htmlFor="share-quantity"
              className="block mb-2 text-sm font-medium text-stone-700"
            >
              Number of shares
            </label>

            <input
              id="share-quantity"
              type="number"
              min="1"
              max={remaining.toString()}
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              disabled={!property.active || remaining === 0n || busy}
              className="w-full px-4 py-3 border rounded-xl border-stone-300 outline-none focus:border-[#1f3d34] disabled:bg-stone-100"
            />
          </div>

          <div className="flex justify-between mt-5 text-sm">
            <span className="text-stone-500">Price per share</span>
            <span className="font-medium">
              {formatSharePrice(property.pricePerTokenWei)}
            </span>
          </div>

          <div className="flex justify-between mt-3 text-sm">
            <span className="text-stone-500">Quantity</span>
            <span className="font-medium">
              {validQuantity ? quantity : "—"}
            </span>
          </div>

          <div className="pt-4 mt-4 border-t border-stone-200">
            <div className="flex items-center justify-between">
              <span className="font-medium text-stone-700">
                Total Cost
              </span>

              <span className="text-lg font-semibold text-stone-900">
                {formatSharePrice(totalCost)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleBuy}
            disabled={
              busy ||
              !property.active ||
              remaining === 0n ||
              networkStatus !== "sepolia"
            }
            className="w-full mt-6 rounded-full bg-[#1f3d34] px-5 py-3 font-medium text-[#f6f1e7] transition hover:bg-[#173028] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy
              ? "Processing Transaction..."
              : !property.active
                ? "Property Paused"
                : remaining === 0n
                  ? "Sold Out"
                  : networkStatus !== "sepolia"
                    ? "Switch to Sepolia"
                    : account
                      ? "Buy Shares with MetaMask"
                      : "Connect & Buy with MetaMask"}
          </button>

          {error && (
            <p className="mt-4 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          {success && (
            <p className="mt-4 text-sm text-emerald-800" role="status">
              {success}
            </p>
          )}

          {txHash && (
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-3 text-sm text-[#1f3d34] underline"
            >
              View Transaction on Etherscan ↗
            </a>
          )}

          <p className="mt-5 text-xs leading-relaxed text-stone-500">
            This is a college demonstration using Sepolia test ETH.
            Tokens represent simulated shares and do not provide
            legal ownership of property.
          </p>
        </aside>
      </div>
    </main>
  );
}
