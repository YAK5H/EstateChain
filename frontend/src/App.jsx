import AdminSection from "./components/AdminSection.jsx";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import { useCallback, useEffect, useState } from "react";
import { getAddress } from "ethers";

import PropertyDetails from "./pages/PropertyDetails.jsx";
import Portfolio from "./pages/Portfolio.jsx";
import Marketplace from "./pages/Marketplace.jsx";
import Admin from "./pages/Admin.jsx";
import AdminPropertyDetails from "./pages/AdminPropertyDetails.jsx";
import AdminPropertyList from "./components/AdminPropertyList.jsx";
import NotFound from "./pages/NotFound.jsx";

import Navbar from "./components/Navbar.jsx";

import { getReadOnlyContract } from "./lib/contract.js";
import {
  ESTATE_CHAIN_ADDRESS,
  SEPOLIA_CHAIN_ID,
} from "./lib/config.js";

import { shortAddress } from "./lib/format.js";

import {
  assertSepolia,
  connectWallet,
  getMetaMask,
  hasMetaMask,
  switchToSepolia,
} from "./lib/wallet.js";


function isSepoliaChain(chainId) {
  try {
    return BigInt(chainId) === SEPOLIA_CHAIN_ID;
  } catch {
    return false;
  }
}


function walletErrorMessage(error) {
  if (error && error.code === 4001) {
    return "The request was rejected in MetaMask.";
  }

  return (
    error?.shortMessage ||
    error?.message ||
    "Something went wrong with the wallet."
  );
}


function sameAddress(left, right) {
  try {
    return getAddress(left) === getAddress(right);
  } catch {
    return false;
  }
}


// Read all properties from the multi-owner contract.
async function readPropertiesFrom(contract) {
  const count = await contract.propertyCount();
  const total = Number(count);
  const items = [];

  for (let id = 1; id <= total; id += 1) {
    const property = await contract.properties(id);

    items.push({
      id: Number(property.id),
      name: property.name,
      location: property.location,
      imageUrl: property.imageUrl,
      pricePerTokenWei: property.pricePerTokenWei,
      maxSupply: property.maxSupply,
      minted: property.minted,
      token: property.token,
      propertyOwner: property.propertyOwner,
      active: property.active,
    });
  }

  return {
    status: total === 0 ? "empty" : "ready",
    count: total,
    items,
    error: "",
  };
}


export default function App() {
  const [account, setAccount] = useState(null);

  const [networkStatus, setNetworkStatus] = useState(
    () => (hasMetaMask() ? "checking" : "unavailable")
  );

  const [connecting, setConnecting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [walletError, setWalletError] = useState("");

  const [ownerAddress, setOwnerAddress] = useState(null);
  const [ownerLoaded, setOwnerLoaded] = useState(false);

  const [properties, setProperties] = useState({
    status: "loading",
    count: 0,
    items: [],
    error: "",
  });


  const readProperties = useCallback(
    async () => readPropertiesFrom(getReadOnlyContract()),
    []
  );


  function propertiesError(error) {
    return {
      status: "error",
      count: 0,
      items: [],
      error:
        error?.shortMessage ||
        error?.message ||
        "The property list could not be read from Sepolia.",
    };
  }


  // Detect MetaMask account and network changes.
  useEffect(() => {
    let ignore = false;

    async function readWallet() {
      if (!hasMetaMask()) return;

      try {
        const ethereum = getMetaMask();

        const [accounts, chainId] = await Promise.all([
          ethereum.request({ method: "eth_accounts" }),
          ethereum.request({ method: "eth_chainId" }),
        ]);

        if (ignore) return;

        setAccount(
          Array.isArray(accounts) && accounts[0]
            ? accounts[0]
            : null
        );

        setNetworkStatus(
          isSepoliaChain(chainId) ? "sepolia" : "wrong"
        );
      } catch (error) {
        if (!ignore) {
          setNetworkStatus("wrong");
          setWalletError(walletErrorMessage(error));
        }
      }
    }

    readWallet();

    if (!hasMetaMask()) return undefined;

    const ethereum = getMetaMask();

    function handleAccounts(accounts) {
      setAccount(
        Array.isArray(accounts) && accounts[0]
          ? accounts[0]
          : null
      );

      setWalletError("");
    }

    function handleChain(chainId) {
      setNetworkStatus(
        isSepoliaChain(chainId) ? "sepolia" : "wrong"
      );
      setWalletError("");
    }

    ethereum.on?.("accountsChanged", handleAccounts);
    ethereum.on?.("chainChanged", handleChain);

    return () => {
      ignore = true;

      ethereum.removeListener?.(
        "accountsChanged",
        handleAccounts
      );

      ethereum.removeListener?.(
        "chainChanged",
        handleChain
      );
    };
  }, []);


  // Read the admin/deployer address from the contract.
  useEffect(() => {
    let ignore = false;

    getReadOnlyContract()
      .owner()
      .then((address) => {
        if (!ignore) {
          setOwnerAddress(address);
          setOwnerLoaded(true);
        }
      })
      .catch(() => {
        if (!ignore) {
          setOwnerAddress(null);
          setOwnerLoaded(true);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);


  // Load properties from Sepolia.
  useEffect(() => {
    let ignore = false;

    readProperties()
      .then((result) => {
        if (!ignore) setProperties(result);
      })
      .catch((error) => {
        if (!ignore) setProperties(propertiesError(error));
      });

    return () => {
      ignore = true;
    };
  }, [readProperties]);


  // Retry loading properties.
// Refresh properties, optionally using the wallet-connected contract.
async function handleRetry(contract = null) {
  setProperties((current) => ({
    ...current,
    status: "loading",
    error: "",
  }));

  try {
    const result = await readPropertiesFrom(
      contract || getReadOnlyContract()
    );

    setProperties(result);
    return result;
  } catch (error) {
    const result = propertiesError(error);
    setProperties(result);
    throw error;
  }
}


  // Refresh properties after registration or management.
  async function handleRegistered(contract) {
    setProperties((current) => ({
      ...current,
      status: "loading",
      error: "",
    }));

    try {
      setProperties(await readPropertiesFrom(contract));
    } catch {
      try {
        setProperties(await readProperties());
      } catch (error) {
        setProperties(propertiesError(error));
        throw error;
      }
    }
  }


  // Admin is the deployer/owner of the marketplace contract.
  const isAdmin = Boolean(
    account &&
    ownerAddress &&
    sameAddress(account, ownerAddress)
  );


  async function handleConnect() {
    setConnecting(true);
    setWalletError("");

    try {
      const { provider, address } = await connectWallet();

      setAccount(address);

      try {
        await assertSepolia(provider);
        setNetworkStatus("sepolia");
      } catch (error) {
        setNetworkStatus("wrong");

        if (
          !String(error?.message || "").startsWith("Wrong network")
        ) {
          setWalletError(walletErrorMessage(error));
        }
      }
    } catch (error) {
      setWalletError(walletErrorMessage(error));
    } finally {
      setConnecting(false);
    }
  }


  async function handleSwitchNetwork() {
    setSwitching(true);
    setWalletError("");

    try {
      await switchToSepolia();

      const chainId = await getMetaMask().request({
        method: "eth_chainId",
      });

      setNetworkStatus(
        isSepoliaChain(chainId) ? "sepolia" : "wrong"
      );
    } catch (error) {
      setWalletError(walletErrorMessage(error));
    } finally {
      setSwitching(false);
    }
  }


  return (
    <BrowserRouter>
      <div
        id="top"
        className="min-h-screen bg-[#f4f1ea] text-stone-900"
      >
        <Navbar
          account={account}
          networkStatus={networkStatus}
          connecting={connecting}
          switching={switching}
          walletError={walletError}
          isAdmin={isAdmin}
          onConnect={handleConnect}
          onSwitchNetwork={handleSwitchNetwork}
        />

        <Routes>
          <Route
            path="/"
            element={
              isAdmin ? (
                <Navigate to="/admin" replace />
              ) : (
                <Marketplace
                  properties={properties}
                  onRetry={handleRetry}
                  account={account}
                  networkStatus={networkStatus}
                />
              )
            }
          />

          <Route
            path="/portfolio"
            element={
              isAdmin ? (
                <Navigate to="/admin" replace />
              ) : (
                <Portfolio
                  properties={properties}
                  account={account}
                  networkStatus={networkStatus}
                  onConnect={handleConnect}
                  onSold={handleRetry}
                  isAdmin={false}
                />
              )
            }
          />

          <Route
            path="/property/:id"
            element={
              isAdmin ? (
                <Navigate to="/admin" replace />
              ) : (
                <PropertyDetails
                  properties={properties}
                  account={account}
                  networkStatus={networkStatus}
                  onRetry={handleRetry}
                />
              )
            }
          />

          {/* Admin-only property inventory and individual property control pages. */}
          <Route
            path="/admin/properties"
            element={
              !ownerLoaded ? (
                <main className="max-w-6xl px-4 py-12 mx-auto text-sm text-stone-600 sm:px-6">Loading platform access…</main>
              ) : isAdmin ? (
                <main className="max-w-6xl px-4 py-8 mx-auto sm:px-6"><AdminPropertyList properties={properties} /></main>
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/admin/properties/:id"
            element={
              !ownerLoaded ? (
                <main className="max-w-6xl px-4 py-12 mx-auto text-sm text-stone-600 sm:px-6">Loading platform access…</main>
              ) : isAdmin ? (
                <AdminPropertyDetails
                  properties={properties}
                  isAdmin={isAdmin}
                  account={account}
                  networkStatus={networkStatus}
                  onRefresh={handleRetry}
                />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />

          {/* Regular users can register and manage their own listings. */}
          <Route
            path="/list-property"
            element={
              !ownerLoaded ? (
                <main className="max-w-6xl px-4 py-12 mx-auto text-sm text-stone-600 sm:px-6">
                  Loading platform access…
                </main>
              ) : isAdmin ? (
                <Navigate to="/admin" replace />
              ) : (
                <AdminSection
                  account={account}
                  networkStatus={networkStatus}
                  switching={switching}
                  onSwitchNetwork={handleSwitchNetwork}
                  onRegistered={handleRegistered}
                  properties={properties}
                  isAdmin={false}
                />
              )
            }
          />

          {/* Only the contract owner can access platform administration. */}
          <Route
            path="/admin"
            element={
              !ownerLoaded ? (
                <main className="max-w-6xl px-4 py-12 mx-auto text-sm text-stone-600 sm:px-6">
                  Loading platform access…
                </main>
              ) : isAdmin ? (
                <Admin
                  account={account}
                  networkStatus={networkStatus}
                  switching={switching}
                  onSwitchNetwork={handleSwitchNetwork}
                  onRegistered={handleRegistered}
                  properties={properties}
                  isAdmin={true}
                />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />

          <Route
            path="*"
            element={<NotFound />}
          />
        </Routes>

        <footer className="border-t border-stone-200">
          <div className="flex flex-col max-w-6xl gap-2 px-4 py-6 mx-auto text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>Use a wallet that holds only test ETH.</p>

            <p>
              Contract{" "}
              <span
                className="font-medium text-stone-700"
                title={ESTATE_CHAIN_ADDRESS}
              >
                {shortAddress(ESTATE_CHAIN_ADDRESS)}
              </span>
            </p>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}
