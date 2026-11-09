
import PropertiesSection from "../components/PropertiesSection.jsx";

export default function Marketplace({
  properties,
  onRetry,
  account,
  networkStatus,
}) {
  return (
    <main>
      <section className="max-w-6xl px-4 pt-12 pb-2 mx-auto sm:px-6 sm:pt-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8a6240]">
          Project·Sepolia
        </p>

        <h1 className="max-w-2xl mt-3 font-serif text-4xl leading-tight text-stone-900 sm:text-5xl">
          Sample property shares, recorded on Ethereum.
        </h1>

        <p className="max-w-2xl mt-4 text-base leading-relaxed text-stone-600 sm:text-lg">
          EstateChain lists practice properties. Each one can have its own
          share token, bought with Sepolia test ETH. These tokens are
          simulated shares.
        </p>
      </section>

      <PropertiesSection
        status={properties.status}
        count={properties.count}
        properties={properties.items}
        error={properties.error}
        onRetry={onRetry}
        account={account}
        networkStatus={networkStatus}
      />
    </main>
  );
}
