
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Contract, formatEther, parseEther } from "ethers";
import { getReadOnlyContract, getSignerContract } from "../lib/contract.js";
import { ESTATE_CHAIN_DEPLOYMENT_BLOCK } from "../lib/config.js";
import { shortAddress } from "../lib/format.js";

const TOKEN_READ_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

const INITIAL_CHUNK_SIZE = 5000;
const MIN_CHUNK_SIZE = 100;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function readableError(error) {
  if (error?.code === 4001 || error?.code === "ACTION_REJECTED") {
    return "Transaction rejected in MetaMask.";
  }

  return (
    error?.shortMessage ||
    error?.reason ||
    error?.message ||
    "The request failed."
  );
}

function formatEth(value) {
  try {
    return `${formatEther(value)} ETH`;
  } catch {
    return "—";
  }
}

/**
 * Fetches event logs in chunks.
 * If the RPC provider rejects a range, the chunk size is reduced
 * and that range is retried.
 */
async function queryLogsAdaptive(contract, filter, startBlock, endBlock) {
  const allLogs = [];
  let fromBlock = startBlock;
  let chunkSize = INITIAL_CHUNK_SIZE;

  while (fromBlock <= endBlock) {
    const toBlock = Math.min(
      fromBlock + chunkSize - 1,
      endBlock
    );

    try {
      const logs = await contract.queryFilter(
        filter,
        fromBlock,
        toBlock
      );

      allLogs.push(...logs);
      fromBlock = toBlock + 1;

      // Gradually return to the normal chunk size after success.
      chunkSize = Math.min(
        INITIAL_CHUNK_SIZE,
        chunkSize * 2
      );
    } catch (error) {
      if (chunkSize <= MIN_CHUNK_SIZE) {
        throw error;
      }

      chunkSize = Math.max(
        MIN_CHUNK_SIZE,
        Math.floor(chunkSize / 2)
      );

      console.warn(
        `Event scan failed. Retrying with ${chunkSize} blocks.`,
        error
      );
    }
  }

  return allLogs;
}

export default function AdminPropertyDetails({
  properties,
  isAdmin,
  account,
  networkStatus,
  onRefresh,
}) {
  const { id } = useParams();

  const property = useMemo(
    () =>
      (properties?.items ?? []).find(
        (item) => String(item.id) === String(id)
      ),
    [properties, id]
  );

  const [reserve, setReserve] = useState(null);
  const [reserveAvailable, setReserveAvailable] = useState(true);
  const [price, setPrice] = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [holders, setHolders] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [eventState, setEventState] = useState("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [eventError, setEventError] = useState("");

  useEffect(() => {
    if (property) {
      setPrice(formatEther(property.pricePerTokenWei));
    }
  }, [property]);

  const loadChainData = useCallback(async () => {
    if (!property?.token) return;

    setEventState("loading");
    setEventError("");

    try {
      const estate = getReadOnlyContract();
      const provider = estate.runner;

      if (!provider) {
        throw new Error("Could not connect to the Sepolia provider.");
      }

      const token = new Contract(
        property.token,
        TOKEN_READ_ABI,
        provider
      );

      const latestBlock = await provider.getBlockNumber();
      const propertyId = BigInt(property.id);

      // Search only for this property's registration event.
      // propertyId is indexed in PropertyRegistered.
      const registrationFilter =
        estate.filters.PropertyRegistered(propertyId);

      const registrationLogs = await queryLogsAdaptive(
        estate,
        registrationFilter,
        ESTATE_CHAIN_DEPLOYMENT_BLOCK,
        latestBlock
      );

      const registration = registrationLogs.find(
        (log) => BigInt(log.args.propertyId) === propertyId
      );

      if (!registration) {
        throw new Error(
          `Registration event for property ${property.id} was not found.`
        );
      }

      const startBlock = registration.blockNumber;

      // Fetch all ERC-20 Transfer events for this property's token.
      const transferLogs = await queryLogsAdaptive(
        token,
        token.filters.Transfer(),
        startBlock,
        latestBlock
      );

      // Ensure logs are processed in chronological order.
      transferLogs.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) {
          return a.blockNumber - b.blockNumber;
        }

        return (a.index ?? 0) - (b.index ?? 0);
      });

      const balances = new Map();
      const activity = [];

      for (const log of transferLogs) {
        const from = log.args.from;
        const to = log.args.to;
        const amount = BigInt(log.args.value);

        const fromKey = from.toLowerCase();
        const toKey = to.toLowerCase();

        // Ignore the zero address as a holder during minting.
        if (fromKey !== ZERO_ADDRESS) {
          const previous = balances.get(fromKey)?.balance ?? 0n;

          balances.set(fromKey, {
            address: from,
            balance: previous - amount,
          });
        }

        // Ignore the zero address as a holder during burning.
        if (toKey !== ZERO_ADDRESS) {
          const previous = balances.get(toKey)?.balance ?? 0n;

          balances.set(toKey, {
            address: to,
            balance: previous + amount,
          });
        }

        activity.push({
          hash: log.transactionHash,
          block: log.blockNumber,
          from,
          to,
          amount,
        });
      }

      const holderRows = [...balances.values()]
        .filter((holder) => holder.balance > 0n)
        .sort((a, b) =>
          a.address.localeCompare(b.address)
        );

      setHolders(holderRows);
      setTransfers(activity.reverse());
      setEventState("ready");
    } catch (scanError) {
          console.error("Holder event scan failed:", scanError);

          const detail =
            scanError?.info?.error?.message ||
            scanError?.error?.message ||
            scanError?.shortMessage ||
            scanError?.message ||
            "Unknown RPC error";

          setEventError(detail);
          setEventState("error");
    }
  }, [property]);

  useEffect(() => {
    let cancelled = false;

    async function loadReserve() {
      try {
        const contract = getReadOnlyContract();
        const value = await contract.buybackReserve(BigInt(id));

        if (!cancelled) {
          setReserve(value);
          setReserveAvailable(true);
        }
      } catch {
        if (!cancelled) {
          setReserve(null);
          setReserveAvailable(false);
        }
      }
    }

    if (property) {
      loadReserve();
      loadChainData();
    }

    return () => {
      cancelled = true;
    };
  }, [id, property, loadChainData]);

  async function runAdminAction(action, successText) {
    if (!account || networkStatus !== "sepolia") {
      setError("Connect the admin wallet on Sepolia first.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const contract = await getSignerContract();
      const signerAddress = await contract.runner.getAddress();
      const owner = await contract.owner();

      if (signerAddress.toLowerCase() !== owner.toLowerCase()) {
        throw new Error(
          "Only the platform admin can perform this action."
        );
      }

      const tx = await action(contract);

      setMessage(
        "Transaction submitted. Waiting for Sepolia confirmation…"
      );

      const receipt = await tx.wait();

      if (!receipt || receipt.status !== 1) {
        throw new Error("Transaction failed on-chain.");
      }

      setMessage(successText);

      // Refresh shared property data using the signer-connected provider.
      await onRefresh?.(contract);

      // Read the updated reserve using the same provider.
      try {
        const updatedReserve = await contract.buybackReserve(
          BigInt(id)
        );

        setReserve(updatedReserve);
        setReserveAvailable(true);
      } catch {
        setReserveAvailable(false);
      }

      // Refresh the holder and transfer history as well.
      await loadChainData();
    } catch (actionError) {
      setError(readableError(actionError));
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <main className="max-w-6xl px-4 py-12 mx-auto">
        You are not authorized to view this page.
      </main>
    );
  }

  if (!property) {
    return (
      <main className="max-w-6xl px-4 py-12 mx-auto">
        <Link
          to="/admin/properties"
          className="text-sm text-[#1f3d34]"
        >
          ← Back to properties
        </Link>

        <p className="mt-6">
          {properties?.status === "loading"
            ? "Loading property…"
            : "Property not found."}
        </p>
      </main>
    );
  }

  const outstanding = BigInt(property.minted ?? 0);
  const maxSupply = BigInt(property.maxSupply ?? 0);

  const remaining =
    maxSupply > outstanding ? maxSupply - outstanding : 0n;

  return (
    <main className="max-w-6xl px-4 py-8 mx-auto sm:px-6">
      <Link
        to="/admin/properties"
        className="text-sm font-medium text-[#1f3d34] hover:underline"
      >
        ← All properties
      </Link>

      <div className="mt-4 overflow-hidden bg-white border shadow-sm rounded-3xl border-stone-200">
        {property.imageUrl ? (
          <img
            src={property.imageUrl}
            alt={property.name}
            className="object-cover w-full h-56"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : null}

        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6240]">
                Property #{property.id} · Administration
              </p>

              <h1 className="mt-2 font-serif text-4xl">
                {property.name}
              </h1>

              <p className="mt-2 text-stone-500">
                {property.location}
              </p>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                property.active
                  ? "bg-emerald-100 text-emerald-900"
                  : "bg-stone-200 text-stone-700"
              }`}
            >
              {property.active ? "Active" : "Deactivated"}
            </span>
          </div>

          <div className="grid gap-3 mt-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [
                "Outstanding shares",
                outstanding.toLocaleString("en-IN"),
              ],
              [
                "Shares remaining",
                remaining.toLocaleString("en-IN"),
              ],
              [
                "Maximum supply",
                maxSupply.toLocaleString("en-IN"),
              ],
              [
                "Current token price",
                formatEth(property.pricePerTokenWei),
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl bg-[#f7f5ef] p-4"
              >
                <p className="text-xs text-stone-500">{label}</p>
                <p className="mt-2 font-serif text-2xl text-[#1f3d34]">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs break-all text-stone-400">
            Token contract: {property.token}
          </p>
        </div>
      </div>

      {message ? (
        <div
          role="status"
          className="p-3 mt-5 text-sm border rounded-xl border-emerald-200 bg-emerald-50 text-emerald-900"
        >
          {message}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="p-3 mt-5 text-sm text-red-900 border border-red-200 rounded-xl bg-red-50"
        >
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 mt-6 lg:grid-cols-2">
        <div className="p-6 bg-white border rounded-3xl border-stone-200">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6240]">
            Property controls
          </p>

          <h2 className="mt-1 font-serif text-2xl">
            Manage listing
          </h2>

          <label className="block mt-5 text-sm font-medium">
            Token price (ETH)

            <input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              inputMode="decimal"
              className="mt-1.5 w-full rounded-xl border border-stone-300 bg-[#faf8f4] px-3 py-2"
            />
          </label>

          <button
            disabled={busy}
            onClick={() => {
              let value;

              try {
                value = parseEther(price.trim());
              } catch {
                setError("Enter a valid ETH price.");
                return;
              }

              if (value <= 0n) {
                setError("Price must be greater than zero.");
                return;
              }

              runAdminAction(
                (contract) => contract.setPrice(BigInt(id), value),
                "Token price updated successfully."
              );
            }}
            className="mt-3 rounded-full bg-[#1f3d34] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Update price
          </button>

          <div className="pt-5 mt-5 border-t border-stone-100">
            <button
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `${property.active ? "Deactivate" : "Reactivate"} ${property.name}?`
                  )
                ) {
                  runAdminAction(
                    (contract) =>
                      contract.setActive(
                        BigInt(id),
                        !property.active
                      ),
                    `Property ${property.active ? "deactivated" : "reactivated"}.`
                  );
                }
              }}
              className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-semibold text-stone-800 disabled:opacity-50"
            >
              {property.active
                ? "Deactivate property"
                : "Reactivate property"}
            </button>
          </div>
        </div>

        <div className="p-6 bg-white border rounded-3xl border-stone-200">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6240]">
            Buyback liquidity
          </p>

          <h2 className="mt-1 font-serif text-2xl">
            Property reserve
          </h2>

          <p className="mt-4 font-serif text-3xl text-[#1f3d34]">
            {reserveAvailable
              ? formatEth(reserve ?? 0n)
              : "Unavailable"}
          </p>

          {!reserveAvailable ? (
            <p className="mt-2 text-sm text-amber-800">
              The currently deployed contract may not include
              reserve functions. This panel becomes active after
              the updated contract is deployed.
            </p>
          ) : (
            <>
              <label className="block mt-4 text-sm font-medium">
                Add reserve (ETH)

                <input
                  value={fundAmount}
                  onChange={(event) =>
                    setFundAmount(event.target.value)
                  }
                  placeholder="0.05"
                  inputMode="decimal"
                  className="mt-1.5 w-full rounded-xl border border-stone-300 bg-[#faf8f4] px-3 py-2"
                />
              </label>

              <button
                disabled={busy || !fundAmount.trim()}
                onClick={() => {
                  let value;

                  try {
                    value = parseEther(fundAmount.trim());
                  } catch {
                    setError("Enter a valid ETH amount.");
                    return;
                  }

                  if (value <= 0n) {
                    setError("Amount must be greater than zero.");
                    return;
                  }

                  runAdminAction(
                    (contract) =>
                      contract.fundBuybackReserve(BigInt(id), {
                        value,
                      }),
                    "Buyback reserve funded successfully."
                  );

                  setFundAmount("");
                }}
                className="mt-3 rounded-full bg-[#1f3d34] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Add to reserve
              </button>
            </>
          )}
        </div>
      </section>

    </main>
  );
}
