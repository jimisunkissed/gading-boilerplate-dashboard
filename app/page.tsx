import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
        <Badge variant="secondary">Next.js · MongoDB · Clerk · Cloudflare R2</Badge>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Hello, welcome 👋
        </h1>
        <p className="max-w-md text-lg text-balance text-muted-foreground">
          This is <span className="font-medium text-foreground">gading-boilerplate-dashboard</span>
          , a dashboard boilerplate. Start building — edit{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
            app/page.tsx
          </code>{" "}
          to replace this page.
        </p>
      </main>
      <footer className="pb-6 text-center text-xs text-muted-foreground">
        by Gading Damarjati
      </footer>
    </div>
  );
}
