import { Outlet, createRootRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/lib/theme";
import "@workspace/ui/globals.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

export const Route = createRootRoute({
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  component: RootComponent,
});

function RootComponent() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
