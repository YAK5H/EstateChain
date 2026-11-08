
import { formatEther } from "ethers";
import { Link } from "react-router-dom";

function formatSharePrice(wei) {
  const value = formatEther(wei);
  if (!value.includes(".")) {
    return `${value} ETH`;
  }

  const trimmed = value.replace(/0+$/, "").replace(/\.$/, "");
  return `${trimmed} ETH`;
}

function PropertyCard({ property }) {
  return (
    <article className="overflow-hidden bg-white border shadow-sm rounded-2xl border-stone-200">
      <div className="aspect-[4/3] bg-stone-100">
        {property.imageUrl ? (
          <img
            src={property.imageUrl}
            alt=""
            className="object-cover w-full h-full"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : null}
      </div>

      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-serif text-xl text-stone-900">
            {property.name}
          </h3>

          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              property.active
                ? "bg-emerald-100 text-emerald-900"
                : "bg-stone-200 text-stone-700"
            }`}
          >
            {property.active ? "Open" : "Paused"}
          </span>
        </div>

        <p className="text-sm text-stone-600">{property.location}</p>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-stone-500">Price per share</dt>
            <dd className="font-medium text-stone-900">
              {formatSharePrice(property.pricePerTokenWei)}
            </dd>
          </div>

          <div>
            <dt className="text-stone-500">Shares sold</dt>
            <dd className="font-medium text-stone-900">
              {property.minted.toString()} / {property.maxSupply.toString()}
            </dd>
          </div>
        </dl>

        <Link
          to={`/property/${property.id}`}
          className="block w-full rounded-full bg-[#1f3d34] px-4 py-3 text-center text-sm font-medium text-[#f6f1e7] transition hover:bg-[#173028]"
        >
          View Property Details
        </Link>
      </div>
    </article>
  );
}

function EmptyState({ count }) {
  return (
    <div className="px-6 text-center border border-dashed rounded-3xl border-stone-300 bg-white/70 py-14">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#1f3d34] text-[#f6f1e7]">
        <svg
          viewBox="0 0 24 24"
          className="h-7 w-7"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5.5v-6h-3V21H5a1 1 0 0 1-1-1v-9.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h3 className="mt-5 font-serif text-2xl text-stone-900">
        No properties listed yet
      </h3>

      <p className="max-w-md mx-auto mt-3 text-sm leading-relaxed text-stone-600">
        EstateChain is live on Sepolia and currently reports {count} registered
        properties. Listings will appear in this marketplace after the admin
        registers a sample property.
      </p>
    </div>
  );
}

export default function PropertiesSection({
  status,
  count,
  properties,
  error,
  onRetry,
}) {
  return (
    <section
      id="properties"
      className="max-w-6xl px-4 py-10 mx-auto sm:px-6 sm:py-14"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6240]">
            Marketplace
          </p>
          <h2 className="mt-2 font-serif text-3xl text-stone-900">
            Properties
          </h2>
        </div>

        {status === "ready" || status === "empty" ? (
          <p className="text-sm text-stone-600">
            {count} {count === 1 ? "property" : "properties"} on Sepolia
          </p>
        ) : null}
      </div>

      <div className="mt-8">
        {status === "loading" ? (
          <div
            className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            role="status"
            aria-live="polite"
          >
            <span className="sr-only">Loading properties from Sepolia</span>

            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="overflow-hidden bg-white border rounded-2xl border-stone-200"
              >
                <div className="aspect-[4/3] animate-pulse bg-stone-200" />
                <div className="p-5 space-y-3">
                  <div className="w-2/3 h-5 rounded animate-pulse bg-stone-200" />
                  <div className="w-1/2 h-4 rounded animate-pulse bg-stone-100" />
                  <div className="w-full h-4 rounded animate-pulse bg-stone-100" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {status === "error" ? (
          <div
            className="px-6 py-10 text-center border border-red-200 rounded-3xl bg-red-50"
            role="alert"
          >
            <h3 className="font-serif text-2xl text-red-950">
              Could not load properties
            </h3>

            <p className="max-w-lg mx-auto mt-3 text-sm leading-relaxed text-red-900">
              {error}
            </p>

            <button
              type="button"
              onClick={onRetry}
              className="mt-6 rounded-full bg-[#1f3d34] px-4 py-2 text-sm font-medium text-[#f6f1e7] hover:bg-[#173028]"
            >
              Try again
            </button>
          </div>
        ) : null}

        {status === "empty" ? <EmptyState count={count} /> : null}

        {status === "ready" ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
