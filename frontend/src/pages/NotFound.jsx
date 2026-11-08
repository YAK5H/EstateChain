import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="max-w-6xl px-4 py-24 mx-auto text-center">
      <h1 className="font-serif text-4xl">404 - Page Not Found</h1>

      <p className="mt-4 text-stone-600">
        The page you're looking for doesn't exist.
      </p>

      <Link
        to="/"
        className="mt-6 inline-block rounded-full bg-[#1f3d34] px-5 py-3 text-sm font-medium text-white"
      >
        Back to Marketplace
      </Link>
    </main>
  );
}