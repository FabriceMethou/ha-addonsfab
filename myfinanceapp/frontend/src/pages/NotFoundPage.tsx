import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="font-mono text-sm tracking-widest text-muted-foreground">
        404
      </p>
      <h1 className="text-xl font-semibold">No such page</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The address you followed doesn’t match anything in the app.
      </p>
      <Link
        to="/"
        className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
