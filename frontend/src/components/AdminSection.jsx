
import { useEffect, useRef, useState } from "react";
import { parseEther, formatEther, getAddress } from "ethers";
import {
  getSignerContract,
  getReadOnlyContract,
} from "../lib/contract.js";
import { shortAddress } from "../lib/format.js";

const EMPTY_FORM = {
  name: "",
  symbol: "",
  location: "",
  imageUrl: "",
  priceEth: "",
  maxSupply: "",
};

function errorCode(error) {
  return error?.code ?? error?.info?.error?.code ?? error?.error?.code;
}

function registrationErrorMessage(error) {
  const code = errorCode(error);

  if (code === 4001 || code === "ACTION_REJECTED") {
    return "The request was rejected in MetaMask.";
  }

  const message = error?.shortMessage || error?.reason || error?.message || "";

  if (message.startsWith("Wrong network")) return message;

  if (message.includes("Not authorized")) {
    return "This wallet is not authorized to manage this property.";
  }

  if (message.includes("MetaMask")) return message;

  const revert = message.match(/execution reverted:?\s*"?([^"]+)"?/i);

  return revert?.[1] || message || "The transaction could not be completed.";
}

function formatEth(value) {
  const formatted = formatEther(value);
  return `${formatted.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1")} ETH`;
}

function StatusBanner({ state, message, txHash }) {
  if (state === "idle" || !message) return null;

  const styles = {
    confirming: "border-amber-200 bg-amber-50 text-amber-950",
    pending: "border-stone-200 bg-white text-stone-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950",
    error: "border-red-200 bg-red-50 text-red-950",
  };

  const labels = {
    confirming: "Waiting for MetaMask",
    pending: "Transaction pending",
    success: "Transaction successful",
    error: "Transaction failed",
  };

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${styles[state] || styles.error}`}
      role="status"
      aria-live="polite"
    >
      <p className="font-medium">{labels[state] || labels.error}</p>
      <p className="mt-1 leading-relaxed">{message}</p>

      {txHash && (
        <a
          className="inline-block mt-2 font-medium underline decoration-stone-400 underline-offset-2"
          href={`https://sepolia.etherscan.io/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction
        </a>
      )}
    </div>
  );
}

function PropertyRow({
  property,
  busy,
  onToggle,
  onPriceUpdate,
  isAdmin,
  reserve,
  reserveStatus,
  reserveAmount,
  onReserveAmountChange,
  onFundReserve,
}) {
  const [price, setPrice] = useState(
    formatEther(property.pricePerTokenWei)
  );
  const [savingPrice, setSavingPrice] = useState(false);

  useEffect(() => {
    setPrice(formatEther(property.pricePerTokenWei));
  }, [property.pricePerTokenWei]);

  async function handlePriceUpdate() {
    if (!price.trim()) return;

    let priceWei;

    try {
      priceWei = parseEther(price.trim());
    } catch {
      window.alert("Enter a valid price in ETH.");
      return;
    }

    if (priceWei <= 0n) {
      window.alert("Price must be greater than zero.");
      return;
    }

    setSavingPrice(true);

    try {
      await onPriceUpdate(property, priceWei);
    } finally {
      setSavingPrice(false);
    }
  }

  return (
    <div className="p-4 border rounded-2xl border-stone-200">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-serif text-xl text-stone-900">
            {property.name}
          </h3>

          <p className="mt-1 text-sm text-stone-600">
            {property.location}
          </p>

          <p className="mt-1 text-xs text-stone-500">
            Owner: {shortAddress(property.propertyOwner)}
          </p>

          <span
            className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
              property.active
                ? "bg-emerald-100 text-emerald-900"
                : "bg-stone-200 text-stone-700"
            }`}
          >
            {property.active ? "Active" : "Paused"}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onToggle(property)}
          disabled={busy}
          className={`rounded-full px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
            property.active
              ? "border border-red-200 bg-white text-red-800 hover:bg-red-50"
              : "bg-[#1f3d34] text-[#f6f1e7] hover:bg-[#173028]"
          }`}
        >
          {busy
            ? "Updating..."
            : property.active
              ? "Deactivate"
              : "Reactivate"}
        </button>
      </div>

      <div className="flex flex-col gap-2 mt-4 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm font-medium text-stone-700">
          Price per token (Sepolia ETH)
          <input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            disabled={busy || savingPrice}
            inputMode="decimal"
            className="mt-1.5 w-full rounded-xl border border-stone-300 bg-[#faf8f4] px-3 py-2 font-normal text-stone-900 outline-none focus:ring-2 focus:ring-[#1f3d34] disabled:opacity-60"
          />
        </label>

        <button
          type="button"
          onClick={handlePriceUpdate}
          disabled={busy || savingPrice}
          className="px-4 py-2 text-sm font-medium border rounded-full border-stone-300 text-stone-800 hover:bg-stone-50 disabled:opacity-60"
        >
          {savingPrice ? "Saving..." : "Update price"}
        </button>
      </div>

      {isAdmin && (
        <div className="pt-4 mt-4 border-t border-stone-200">
          <p className="text-xs font-medium text-stone-500">
            Buyback Reserve
          </p>

          {reserveStatus === "loading" ? (
            <p className="mt-1 font-serif text-2xl text-stone-500">
              Loading...
            </p>
          ) : reserveStatus === "unavailable" ? (
            <p className="mt-2 text-sm leading-relaxed text-amber-800">
              Reserve data unavailable. The currently deployed contract
              may not support buyback reserves yet. This should work
              after deploying the updated EstateChain contract.
            </p>
          ) : (
            <p className="mt-1 font-serif text-2xl text-[#1f3d34]">
              {formatEth(reserve ?? 0n)}
            </p>
          )}

          <div className="flex flex-col gap-2 mt-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm font-medium text-stone-700">
              Add reserve (Sepolia ETH)
              <input
                value={reserveAmount}
                onChange={(event) =>
                  onReserveAmountChange(property.id, event.target.value)
                }
                disabled={busy || reserveStatus !== "ready"}
                inputMode="decimal"
                placeholder="0.05"
                className="mt-1.5 w-full rounded-xl border border-stone-300 bg-[#faf8f4] px-3 py-2 font-normal text-stone-900 outline-none focus:ring-2 focus:ring-[#1f3d34] disabled:opacity-60"
              />
            </label>

            <button
              type="button"
              onClick={() => onFundReserve(property)}
              disabled={
                busy ||
                !reserveAmount.trim() ||
                reserveStatus !== "ready"
              }
              className="px-4 py-2 text-sm font-medium text-white bg-[#1f3d34] rounded-full hover:bg-[#173028] disabled:opacity-60"
            >
              {busy ? "Funding..." : "Add to Reserve"}
            </button>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-stone-500">
            ETH added here is reserved for token buybacks and cannot be
            withdrawn through the platform's surplus withdrawal function.
          </p>
        </div>
      )}
    </div>
  );
}

function ManageProperties({
  account,
  networkStatus,
  properties = [],
  onRegistered,
  isAdmin,
}) {
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reserves, setReserves] = useState({});
  const [reserveAmounts, setReserveAmounts] = useState({});
  const [reserveStatus, setReserveStatus] = useState("loading");
  const submitting = useRef(false);

  const propertyItems = Array.isArray(properties)
    ? properties
    : properties?.items ?? [];

  const myProperties = isAdmin
    ? propertyItems
    : propertyItems.filter((property) => {
        if (!account || !property.propertyOwner) return false;

        return (
          property.propertyOwner.toLowerCase() === account.toLowerCase()
        );
      });

  useEffect(() => {
    let ignore = false;

    async function loadReserves() {
      setReserveStatus("loading");

      try {
        const contract = getReadOnlyContract();

        const entries = await Promise.all(
          propertyItems.map(async (property) => {
            const reserve = await contract.buybackReserve(
              BigInt(property.id)
            );

            return [property.id, reserve];
          })
        );

        if (!ignore) {
          setReserves(Object.fromEntries(entries));
          setReserveStatus("ready");
        }
      } catch (err) {
        console.error("Could not load buyback reserves:", err);

        if (!ignore) {
          setReserveStatus("unavailable");
        }
      }
    }

    if (propertyItems.length > 0) {
      loadReserves();
    } else {
      setReserves({});
      setReserveStatus("ready");
    }

    return () => {
      ignore = true;
    };
  }, [properties]);

  async function getAuthorizedContract(property) {
    const contract = await getSignerContract();

    if (
      !contract.runner ||
      typeof contract.runner.getAddress !== "function"
    ) {
      throw new Error("Connect your wallet in MetaMask first.");
    }

    const signerAddress = await contract.runner.getAddress();
    const adminAddress = await contract.owner();

    const isCurrentAdmin =
      getAddress(signerAddress) === getAddress(adminAddress);

    const isPropertyOwner =
      getAddress(signerAddress) === getAddress(property.propertyOwner);

    if (!isCurrentAdmin && !isPropertyOwner) {
      throw new Error("Not authorized to manage this property.");
    }

    return contract;
  }

  async function handleFundReserve(property) {
    if (submitting.current) return;

    if (!isAdmin) {
      setError("Only the platform admin can fund buyback reserves.");
      return;
    }

    if (reserveStatus !== "ready") {
      setError("Buyback reserve data is unavailable. Please try again after deploying the updated contract.");
      return;
    }

    if (!account || networkStatus !== "sepolia") {
      setError("Connect the admin wallet and switch to Sepolia first.");
      return;
    }

    const amountText = (reserveAmounts[property.id] || "").trim();

    let amountWei;

    try {
      amountWei = parseEther(amountText);
    } catch {
      setError("Enter a valid ETH amount.");
      return;
    }

    if (amountWei <= 0n) {
      setError("Reserve funding amount must be greater than zero.");
      return;
    }

    submitting.current = true;
    setBusyId(property.id);
    setMessage("");
    setError("");

    try {
      const contract = await getSignerContract();

      if (
        !contract.runner ||
        typeof contract.runner.getAddress !== "function"
      ) {
        throw new Error("Connect your wallet in MetaMask first.");
      }

      const signerAddress = await contract.runner.getAddress();
      const adminAddress = await contract.owner();

      if (
        getAddress(signerAddress) !== getAddress(adminAddress)
      ) {
        throw new Error("Only the platform admin can fund buyback reserves.");
      }

      const tx = await contract.fundBuybackReserve(
        BigInt(property.id),
        { value: amountWei }
      );

      setMessage(
        `Reserve funding submitted for ${property.name}. Waiting for confirmation...`
      );

      const receipt = await tx.wait();

      if (!receipt || receipt.status !== 1) {
        throw new Error("The reserve funding transaction failed.");
      }

      setReserves((previous) => ({
        ...previous,
        [property.id]: (previous[property.id] || 0n) + amountWei,
      }));

      setReserveAmounts((previous) => ({
        ...previous,
        [property.id]: "",
      }));

      setMessage(
        `Successfully added ${formatEth(amountWei)} to ${property.name}'s buyback reserve.`
      );

      try {
        await onRegistered(contract);
      } catch (refreshError) {
        console.error("Marketplace refresh failed:", refreshError);
        setMessage(
          "Reserve funding succeeded on Sepolia, but the page refresh failed. Reload the page to see the updated reserve."
        );
      }
    } catch (err) {
      setError(registrationErrorMessage(err));
    } finally {
      submitting.current = false;
      setBusyId(null);
    }
  }

  async function handleToggle(property) {
    if (submitting.current) return;

    if (!account) {
      setError("Connect your wallet first.");
      return;
    }

    if (networkStatus !== "sepolia") {
      setError("Switch MetaMask to Sepolia first.");
      return;
    }

    const nextActive = !property.active;
    const action = nextActive ? "reactivate" : "deactivate";

    if (
      !window.confirm(
        `Are you sure you want to ${action} ${property.name}?`
      )
    ) {
      return;
    }

    submitting.current = true;
    setBusyId(property.id);
    setMessage("");
    setError("");

    try {
      const contract = await getAuthorizedContract(property);

      const tx = await contract.setActive(
        BigInt(property.id),
        nextActive
      );

      setMessage("Transaction submitted. Waiting for confirmation...");

      const receipt = await tx.wait();

      if (!receipt || receipt.status !== 1) {
        throw new Error("The transaction was not successful.");
      }

      setMessage(
        `${property.name} has been ${
          nextActive ? "reactivated" : "deactivated"
        } successfully.`
      );

      try {
        await onRegistered(contract);
      } catch (refreshError) {
        console.error("Marketplace refresh failed:", refreshError);
        setMessage(
          `${property.name} was ${
            nextActive ? "reactivated" : "deactivated"
          } successfully on Sepolia, but the page refresh failed. Reload the page to see the updated status.`
        );
      }
    } catch (err) {
      setError(registrationErrorMessage(err));
    } finally {
      submitting.current = false;
      setBusyId(null);
    }
  }

  async function handlePriceUpdate(property, priceWei) {
    if (submitting.current) return;

    if (!account || networkStatus !== "sepolia") {
      setError("Connect your wallet and switch to Sepolia first.");
      return;
    }

    submitting.current = true;
    setBusyId(property.id);
    setMessage("");
    setError("");

    try {
      const contract = await getAuthorizedContract(property);

      const tx = await contract.setPrice(
        BigInt(property.id),
        priceWei
      );

      setMessage("Price update submitted. Waiting for confirmation...");

      const receipt = await tx.wait();

      if (!receipt || receipt.status !== 1) {
        throw new Error("The price update transaction failed.");
      }

      setMessage(`${property.name} price updated successfully.`);

      try {
        await onRegistered(contract);
      } catch (refreshError) {
        console.error("Marketplace refresh failed:", refreshError);
        setMessage(
          `${property.name} price was updated successfully on Sepolia, but the page refresh failed. Reload the page to see the updated price.`
        );
      }
    } catch (err) {
      setError(registrationErrorMessage(err));
    } finally {
      submitting.current = false;
      setBusyId(null);
    }
  }

  return (
    <div className="p-5 mt-6 bg-white border shadow-sm rounded-3xl border-stone-200 sm:p-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6240]">
          {isAdmin ? "Platform administration" : "Your listings"}
        </p>

        <h2 className="mt-2 font-serif text-3xl text-stone-900">
          {isAdmin ? "All property listings" : "Manage properties"}
        </h2>

        <p className="mt-2 text-sm text-stone-600">
          {isAdmin
            ? "As the platform admin, you can manage every registered property and fund its buyback reserve."
            : "Update your token prices or pause and reactivate your own listings."}
        </p>
      </div>

      {message && (
        <p
          className="p-3 mt-4 text-sm border rounded-xl border-emerald-200 bg-emerald-50 text-emerald-900"
          role="status"
        >
          {message}
        </p>
      )}

      {error && (
        <p
          className="p-3 mt-4 text-sm text-red-900 border border-red-200 rounded-xl bg-red-50"
          role="alert"
        >
          {error}
        </p>
      )}

      {myProperties.length === 0 ? (
        <p className="px-4 py-8 mt-6 text-sm text-center border border-dashed rounded-2xl border-stone-300 text-stone-600">
          {isAdmin
            ? "No properties have been registered on the platform yet."
            : "You have not registered any properties with this wallet yet."}
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {myProperties.map((property) => (
            <PropertyRow
              key={property.id.toString()}
              property={property}
              busy={busyId === property.id}
              onToggle={handleToggle}
              onPriceUpdate={handlePriceUpdate}
              isAdmin={isAdmin}
              reserve={reserves[property.id]}
              reserveStatus={reserveStatus}
              reserveAmount={reserveAmounts[property.id] || ""}
              onReserveAmountChange={(id, value) =>
                setReserveAmounts((previous) => ({
                  ...previous,
                  [id]: value,
                }))
              }
              onFundReserve={handleFundReserve}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminSection({
  account,
  networkStatus,
  switching,
  onSwitchNetwork,
  onRegistered,
  properties,
  isAdmin,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [txState, setTxState] = useState("idle");
  const [txMessage, setTxMessage] = useState("");
  const [txHash, setTxHash] = useState("");
  const submitting = useRef(false);

  const onSepolia = networkStatus === "sepolia";
  const busy = txState === "confirming" || txState === "pending";

  const submitLabel =
    txState === "confirming"
      ? "Confirm in MetaMask…"
      : txState === "pending"
        ? "Waiting for confirmation…"
        : "Register property";

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));

    if (txState === "success" || txState === "error") {
      setTxState("idle");
      setTxMessage("");
      setTxHash("");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submitting.current) return;

    if (!account) {
      setTxState("error");
      setTxMessage(
        "Connect your wallet in MetaMask before registering a property."
      );
      return;
    }

    if (!onSepolia) {
      setTxState("error");
      setTxMessage(
        "Switch MetaMask to Sepolia before registering a property."
      );
      return;
    }

    const name = form.name.trim();
    const symbol = form.symbol.trim();
    const location = form.location.trim();
    const imageUrl = form.imageUrl.trim();
    const priceEth = form.priceEth.trim();
    const supplyText = form.maxSupply.trim();

    if (
      !name ||
      !symbol ||
      !location ||
      !imageUrl ||
      !priceEth ||
      !supplyText
    ) {
      setTxState("error");
      setTxMessage("Enter all property details before registering.");
      return;
    }

    let pricePerTokenWei;

    try {
      pricePerTokenWei = parseEther(priceEth);
    } catch {
      setTxState("error");
      setTxMessage("Enter a valid price in Sepolia ETH, such as 0.01.");
      return;
    }

    if (pricePerTokenWei <= 0n) {
      setTxState("error");
      setTxMessage("Price per token must be greater than zero.");
      return;
    }

    if (
      !/^\d+$/.test(supplyText) ||
      supplyText.replace(/^0+/, "") === ""
    ) {
      setTxState("error");
      setTxMessage(
        "Maximum token supply must be a whole number greater than zero."
      );
      return;
    }

    const maxSupply = BigInt(supplyText);

    if (maxSupply > 2n ** 256n - 1n) {
      setTxState("error");
      setTxMessage(
        "Maximum token supply is larger than the contract can store."
      );
      return;
    }

    submitting.current = true;
    setTxHash("");
    setTxState("confirming");
    setTxMessage("Confirm the registration in MetaMask.");

    try {
      const contract = await getSignerContract();

      if (
        !contract.runner ||
        typeof contract.runner.getAddress !== "function"
      ) {
        throw new Error("Connect your wallet in MetaMask first.");
      }

      const tx = await contract.registerProperty(
        name,
        symbol,
        location,
        imageUrl,
        pricePerTokenWei,
        maxSupply
      );

      setTxHash(tx.hash);
      setTxState("pending");
      setTxMessage(
        "Transaction sent. Waiting for Sepolia confirmation."
      );

      const receipt = await tx.wait();

      if (!receipt || receipt.status !== 1) {
        throw new Error(
          "Sepolia did not successfully register the property."
        );
      }

      setForm(EMPTY_FORM);
      setTxState("success");
      setTxMessage(
        "Property registered. Refreshing the marketplace..."
      );

      try {
        await onRegistered(contract);
        setTxMessage(
          "Property registered successfully and marketplace refreshed."
        );
      } catch {
        setTxMessage(
          "Property registered on Sepolia, but the marketplace refresh failed. Refresh the page to see it."
        );
      }
    } catch (error) {
      setTxState("error");
      setTxMessage(registrationErrorMessage(error));
    } finally {
      submitting.current = false;
    }
  }

  return (
    <section
      id="admin"
      className="max-w-6xl px-4 py-6 mx-auto sm:px-6"
    >
      <div className="p-5 bg-white border shadow-sm rounded-3xl border-stone-200 sm:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6240]">
              Property owner
            </p>

            <h2 className="mt-2 font-serif text-3xl text-stone-900">
              List a property
            </h2>
          </div>

          <p className="text-sm text-stone-600" title={account || ""}>
            Connected wallet {shortAddress(account)}
          </p>
        </div>

        <p className="max-w-2xl mt-3 text-sm leading-relaxed text-stone-600">
          Register a property and deploy its share token. Your connected
          wallet will become the property owner and will be able to manage
          its listing. Confirm the transaction in MetaMask. Gas is paid
          in Sepolia test ETH.
        </p>

        {networkStatus === "wrong" ||
        networkStatus === "unavailable" ? (
          <div className="px-4 py-3 mt-5 text-sm border rounded-2xl border-amber-200 bg-amber-50 text-amber-950">
            <p>
              MetaMask needs to be on Sepolia before registering.
            </p>

            <button
              type="button"
              onClick={onSwitchNetwork}
              disabled={switching || busy}
              className="px-3 py-2 mt-3 text-sm font-medium bg-white border rounded-full border-amber-300 text-amber-950 hover:bg-amber-100 disabled:opacity-60"
            >
              {switching ? "Switching…" : "Switch to Sepolia"}
            </button>
          </div>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-stone-700">
              Property name
              <input
                value={form.name}
                onChange={(event) =>
                  updateField("name", event.target.value)
                }
                disabled={busy}
                autoComplete="off"
                className="mt-1.5 w-full rounded-xl border border-stone-300 bg-[#faf8f4] px-3 py-2 font-normal text-stone-900 outline-none ring-[#1f3d34] focus:ring-2 disabled:opacity-60"
              />
            </label>

            <label className="block text-sm font-medium text-stone-700">
              Token symbol
              <input
                value={form.symbol}
                onChange={(event) =>
                  updateField("symbol", event.target.value)
                }
                disabled={busy}
                autoComplete="off"
                className="mt-1.5 w-full rounded-xl border border-stone-300 bg-[#faf8f4] px-3 py-2 font-normal text-stone-900 outline-none ring-[#1f3d34] focus:ring-2 disabled:opacity-60"
              />
            </label>

            <label className="block text-sm font-medium text-stone-700">
              Location
              <input
                value={form.location}
                onChange={(event) =>
                  updateField("location", event.target.value)
                }
                disabled={busy}
                autoComplete="off"
                className="mt-1.5 w-full rounded-xl border border-stone-300 bg-[#faf8f4] px-3 py-2 font-normal text-stone-900 outline-none ring-[#1f3d34] focus:ring-2 disabled:opacity-60"
              />
            </label>

            <label className="block text-sm font-medium text-stone-700">
              Image URL
              <input
                value={form.imageUrl}
                onChange={(event) =>
                  updateField("imageUrl", event.target.value)
                }
                disabled={busy}
                autoComplete="off"
                inputMode="url"
                className="mt-1.5 w-full rounded-xl border border-stone-300 bg-[#faf8f4] px-3 py-2 font-normal text-stone-900 outline-none ring-[#1f3d34] focus:ring-2 disabled:opacity-60"
              />
            </label>

            <label className="block text-sm font-medium text-stone-700">
              Price per token in Sepolia ETH
              <input
                value={form.priceEth}
                onChange={(event) =>
                  updateField("priceEth", event.target.value)
                }
                disabled={busy}
                autoComplete="off"
                inputMode="decimal"
                placeholder="0.01"
                className="mt-1.5 w-full rounded-xl border border-stone-300 bg-[#faf8f4] px-3 py-2 font-normal text-stone-900 outline-none ring-[#1f3d34] placeholder:text-stone-400 focus:ring-2 disabled:opacity-60"
              />
            </label>

            <label className="block text-sm font-medium text-stone-700">
              Maximum token supply
              <input
                value={form.maxSupply}
                onChange={(event) =>
                  updateField("maxSupply", event.target.value)
                }
                disabled={busy}
                autoComplete="off"
                inputMode="numeric"
                placeholder="100"
                className="mt-1.5 w-full rounded-xl border border-stone-300 bg-[#faf8f4] px-3 py-2 font-normal text-stone-900 outline-none ring-[#1f3d34] placeholder:text-stone-400 focus:ring-2 disabled:opacity-60"
              />
            </label>
          </div>

          <StatusBanner
            state={txState}
            message={txMessage}
            txHash={txHash}
          />

          <button
            type="submit"
            disabled={busy || !onSepolia || !account}
            className="rounded-full bg-[#1f3d34] px-4 py-2 text-sm font-medium text-[#f6f1e7] hover:bg-[#173028] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitLabel}
          </button>
        </form>
      </div>

      <ManageProperties
        account={account}
        networkStatus={networkStatus}
        properties={properties}
        onRegistered={onRegistered}
        isAdmin={isAdmin}
      />
    </section>
  );
}
