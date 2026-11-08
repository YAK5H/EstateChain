
import { useEffect, useState } from "react";
import { Contract, formatEther } from "ethers";
import { Link } from "react-router-dom";
import {
  getReadOnlyContract,
  getSignerContract,
} from "../lib/contract.js";

const TOKEN_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

function formatEth(value) {
  const formatted = formatEther(value);
  return `${formatted.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1")} ETH`;
}

export default function Portfolio({
  properties,
  account,
  networkStatus,
  onConnect,
  onSold,
  isAdmin,
}) {
  const [portfolio, setPortfolio] = useState({
    status: "idle",
    items: [],
    error: "",
  });

  const [sellAmounts, setSellAmounts] = useState({});
  const [sellingPropertyId, setSellingPropertyId] = useState(null);
  const [sellMessage, setSellMessage] = useState({
    propertyId: null,
    type: "",
    text: "",
  });

  useEffect(() => {
    let ignore = false;

    async function loadPortfolio() {
      if (!account || networkStatus !== "sepolia") {
        setPortfolio({ status: "idle", items: [], error: "" });
        return;
      }

      if (properties.status === "loading") {
        setPortfolio({ status: "loading", items: [], error: "" });
        return;
      }

      if (properties.status === "error") {
        setPortfolio({
          status: "error",
          items: [],
          error: properties.error || "Could not load properties.",
        });
        return;
      }

      if (properties.status === "empty") {
        setPortfolio({ status: "ready", items: [], error: "" });
        return;
      }

      setPortfolio({ status: "loading", items: [], error: "" });

      try {
        const estateContract = getReadOnlyContract();
        const provider = estateContract.runner;

        const results = await Promise.all(
          properties.items.map(async (property) => {
            const tokenContract = new Contract(
              property.token,
              TOKEN_ABI,
              provider
            );

            const balance = await tokenContract.balanceOf(account);

            if (balance === 0n) {
              return null;
            }

            const currentValue =
              BigInt(property.pricePerTokenWei) * balance;

            return {
              ...property,
              balance,
              currentValue,
            };
          })
        );

        if (!ignore) {
          setPortfolio({
            status: "ready",
            items: results.filter(Boolean),
            error: "",
          });
        }
      } catch (error) {
        if (!ignore) {
          setPortfolio({
            status: "error",
            items: [],
            error:
              error?.shortMessage ||
              error?.message ||
              "Unable to read your token balances from Sepolia.",
          });
        }
      }
    }

    loadPortfolio();

    return () => {
      ignore = true;
    };
  }, [account, networkStatus, properties]);

  async function handleSell(property) {
    if (isAdmin) {
      return;
    }

    const amountText = sellAmounts[property.id] || "";

    if (!/^[1-9]\d*$/.test(amountText)) {
      setSellMessage({
        propertyId: property.id,
        type: "error",
        text: "Enter a valid positive whole-token amount.",
      });
      return;
    }

    const amount = BigInt(amountText);

    if (amount > property.balance) {
      setSellMessage({
        propertyId: property.id,
        type: "error",
        text: "You cannot sell more tokens than you own.",
      });
      return;
    }

    try {
      setSellingPropertyId(property.id);
      setSellMessage({
        propertyId: property.id,
        type: "info",
        text: "Please confirm the token approval in MetaMask...",
      });

      const estateContract = await getSignerContract();

      const tokenContract = new Contract(
        property.token,
        TOKEN_ABI,
        estateContract.runner
      );

      // Step 1: Approve EstateChain to burn the selected tokens.
      const approvalTx = await tokenContract.approve(
        estateContract.target,
        amount
      );

      setSellMessage({
        propertyId: property.id,
        type: "info",
        text: "Approval submitted. Waiting for confirmation...",
      });

      await approvalTx.wait();

      // Step 2: Sell the approved tokens through EstateChain.
      setSellMessage({
        propertyId: property.id,
        type: "info",
        text: "Approval confirmed. Please confirm the sale in MetaMask...",
      });

      const sellTx = await estateContract.sellTokens(
        BigInt(property.id),
        amount
      );

      setSellMessage({
        propertyId: property.id,
        type: "info",
        text: "Sale submitted. Waiting for confirmation...",
      });

      await sellTx.wait();

      setSellAmounts((previous) => ({
        ...previous,
        [property.id]: "",
      }));

      setSellMessage({
        propertyId: property.id,
        type: "success",
        text: `Successfully sold ${amountText} token(s). Your ETH payout has been sent.`,
      });

      try {
        if (onSold) {
            await onSold(estateContract);
        }
        } catch (refreshError) {
            console.error("Portfolio refresh failed:", refreshError);
        }
    } catch (error) {
      setSellMessage({
        propertyId: property.id,
        type: "error",
        text:
          error?.shortMessage ||
          error?.reason ||
          error?.message ||
          "The sale could not be completed.",
      });
    } finally {
      setSellingPropertyId(null);
    }
  }

  const totalValue = portfolio.items.reduce(
    (total, property) => total + property.currentValue,
    0n
  );

  return (
    <main className="max-w-6xl px-4 py-12 mx-auto sm:px-6">
      <section className="mb-10">
        <p className="mb-3 text-sm font-medium tracking-wide text-[#1f3d34] uppercase">
          Investor Dashboard
        </p>

        <h1 className="font-serif text-4xl tracking-tight text-stone-900 sm:text-5xl">
          My Portfolio
        </h1>

        <p className="max-w-2xl mt-4 text-stone-600">
          View your property shares and their estimated value on the Sepolia
          test network.
        </p>
      </section>

      {!account ? (
        <section className="p-8 text-center bg-white border border-stone-200 rounded-2xl">
          <h2 className="font-serif text-2xl">Connect your wallet</h2>
          <p className="mt-2 text-stone-600">
            Connect MetaMask to see the property tokens you own.
          </p>
          <button
            type="button"
            onClick={onConnect}
            className="px-5 py-3 mt-5 text-sm font-medium text-white bg-[#1f3d34] rounded-full hover:bg-[#173028]"
          >
            Connect Wallet
          </button>
        </section>
      ) : networkStatus !== "sepolia" ? (
        <section className="p-8 text-center bg-white border border-stone-200 rounded-2xl">
          <h2 className="font-serif text-2xl">Switch to Sepolia</h2>
          <p className="mt-2 text-stone-600">
            Connect your wallet to the Sepolia test network to view your portfolio.
          </p>
        </section>
      ) : portfolio.status === "loading" ? (
        <p className="py-16 text-center text-stone-500">
          Loading your portfolio from Sepolia...
        </p>
      ) : portfolio.status === "error" ? (
        <section className="p-8 text-center bg-white border border-red-200 rounded-2xl">
          <h2 className="font-serif text-2xl">Unable to load portfolio</h2>
          <p className="mt-2 text-sm text-red-800">{portfolio.error}</p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 mb-8 sm:grid-cols-2">
            <div className="p-6 bg-white border border-stone-200 rounded-2xl">
              <p className="text-sm text-stone-500">Estimated Portfolio Value</p>
              <p className="mt-2 font-serif text-3xl text-[#1f3d34]">
                {formatEth(totalValue)}
              </p>
            </div>

            <div className="p-6 bg-white border border-stone-200 rounded-2xl">
              <p className="text-sm text-stone-500">Properties Owned</p>
              <p className="mt-2 font-serif text-3xl text-stone-900">
                {portfolio.items.length}
              </p>
            </div>
          </section>

          {portfolio.items.length === 0 ? (
            <section className="p-10 text-center bg-white border border-stone-200 rounded-2xl">
              <h2 className="font-serif text-2xl">No investments yet</h2>
              <p className="mt-2 text-stone-600">
                Your purchased property shares will appear here.
              </p>
              <Link
                to="/"
                className="inline-block px-5 py-3 mt-5 text-sm font-medium text-white bg-[#1f3d34] rounded-full hover:bg-[#173028]"
              >
                Explore Properties
              </Link>
            </section>
          ) : (
            <section className="space-y-5">
              <h2 className="font-serif text-2xl">Your Properties</h2>

              <div className="grid gap-5 md:grid-cols-2">
                {portfolio.items.map((property) => {
                  const amountText = sellAmounts[property.id] || "";
                  const validAmount = /^[1-9]\d*$/.test(amountText);
                  const estimatedPayout = validAmount
                    ? BigInt(property.pricePerTokenWei) * BigInt(amountText)
                    : 0n;

                  const message =
                    sellMessage.propertyId === property.id
                      ? sellMessage
                      : null;

                  return (
                    <article
                      key={property.id}
                      className="overflow-hidden bg-white border border-stone-200 rounded-2xl"
                    >
                      <img
                        src={property.imageUrl}
                        alt={property.name}
                        className="object-cover w-full h-52"
                      />

                      <div className="p-6">
                        <h3 className="font-serif text-2xl">
                          {property.name}
                        </h3>

                        <p className="mt-1 text-sm text-stone-500">
                          {property.location}
                        </p>

                        {!property.active && (
                          <p className="mt-3 text-xs text-amber-700">
                            This property is inactive. New purchases are disabled,
                            but existing holders can still sell their tokens.
                          </p>
                        )}

                        <div className="grid grid-cols-2 gap-4 mt-6">
                          <div>
                            <p className="text-xs text-stone-500">Shares Owned</p>
                            <p className="mt-1 text-lg font-semibold">
                              {property.balance.toString()}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-stone-500">
                              Current Share Price
                            </p>
                            <p className="mt-1 text-lg font-semibold">
                              {formatEth(property.pricePerTokenWei)}
                            </p>
                          </div>
                        </div>

                        <div className="pt-4 mt-5 border-t border-stone-200">
                          <p className="text-xs text-stone-500">
                            Estimated Current Value
                          </p>
                          <p className="mt-1 font-serif text-2xl text-[#1f3d34]">
                            {formatEth(property.currentValue)}
                          </p>
                        </div>

                        <Link
                          to={`/property/${property.id}`}
                          className="inline-block mt-5 text-sm font-medium text-[#1f3d34] hover:underline"
                        >
                          View Property Details →
                        </Link>

                        {!isAdmin && (
                          <div className="pt-5 mt-5 border-t border-stone-200">
                            <h4 className="font-serif text-xl">
                              Sell Your Shares
                            </h4>

                            <p className="mt-1 text-xs text-stone-500">
                              Enter the number of whole tokens you want to sell.
                            </p>

                            <input
                              type="number"
                              min="1"
                              step="1"
                              max={property.balance.toString()}
                              value={amountText}
                              disabled={sellingPropertyId !== null}
                              onChange={(event) =>
                                setSellAmounts((previous) => ({
                                  ...previous,
                                  [property.id]: event.target.value,
                                }))
                              }
                              placeholder="Number of tokens"
                              className="w-full px-4 py-3 mt-3 text-sm border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1f3d34]"
                            />

                            <p className="mt-2 text-xs text-stone-500">
                              Estimated payout:{" "}
                              <span className="font-semibold text-[#1f3d34]">
                                {formatEth(estimatedPayout)}
                              </span>
                            </p>

                            <button
                              type="button"
                              disabled={
                                sellingPropertyId !== null ||
                                !validAmount ||
                                BigInt(validAmount ? amountText : "0") >
                                  property.balance
                              }
                              onClick={() => handleSell(property)}
                              className="w-full px-5 py-3 mt-4 text-sm font-medium text-white bg-[#1f3d34] rounded-full hover:bg-[#173028] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {sellingPropertyId === property.id
                                ? "Processing Sale..."
                                : "Sell Tokens"}
                            </button>

                            {message && (
                              <p
                                className={`mt-3 text-xs leading-relaxed ${
                                  message.type === "error"
                                    ? "text-red-700"
                                    : message.type === "success"
                                      ? "text-green-700"
                                      : "text-stone-500"
                                }`}
                              >
                                {message.text}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      <p className="mt-10 text-xs leading-relaxed text-stone-500">
        This is a college demonstration using Sepolia test ETH. Portfolio
        values are estimates based on current token prices, not actual
        investment returns or legal ownership of property.
      </p>
    </main>
  );
}
