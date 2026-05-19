import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// SQL Tool — in-memory demo database using a simple JS data store.
// For real databases set DATABASE_URL in .env (not yet wired, extensible).
// ---------------------------------------------------------------------------

// ── Demo in-memory data ──────────────────────────────────────────────────────
interface Customer { id: number; name: string; email: string; country: string; created_at: string }
interface Order { id: number; customer_id: number; product: string; amount: number; status: string; date: string }
interface Product { id: number; name: string; category: string; price: number; stock: number }

const DB: { customers: Customer[]; orders: Order[]; products: Product[] } = {
  customers: [
    { id: 1, name: 'Alice Chen', email: 'alice@acme.com', country: 'USA', created_at: '2024-01-15' },
    { id: 2, name: 'Bob Smith', email: 'bob@startup.io', country: 'UK', created_at: '2024-02-20' },
    { id: 3, name: 'Carol White', email: 'carol@corp.co', country: 'Canada', created_at: '2023-11-10' },
    { id: 4, name: 'David Lee', email: 'david@freelance.me', country: 'USA', created_at: '2024-04-01' },
    { id: 5, name: 'Eva Martinez', email: 'eva@agency.net', country: 'Spain', created_at: '2023-09-05' },
  ],
  orders: [
    { id: 1, customer_id: 1, product: 'Pro Plan', amount: 500, status: 'completed', date: '2024-03-01' },
    { id: 2, customer_id: 2, product: 'Basic Plan', amount: 100, status: 'completed', date: '2024-03-10' },
    { id: 3, customer_id: 3, product: 'Enterprise', amount: 2000, status: 'completed', date: '2024-02-28' },
    { id: 4, customer_id: 1, product: 'Add-on Pack', amount: 150, status: 'pending', date: '2024-04-05' },
    { id: 5, customer_id: 5, product: 'Pro Plan', amount: 500, status: 'completed', date: '2024-03-20' },
  ],
  products: [
    { id: 1, name: 'Basic Plan', category: 'Subscription', price: 100, stock: 999 },
    { id: 2, name: 'Pro Plan', category: 'Subscription', price: 500, stock: 999 },
    { id: 3, name: 'Enterprise', category: 'Subscription', price: 2000, stock: 50 },
    { id: 4, name: 'Add-on Pack', category: 'Add-on', price: 150, stock: 200 },
  ],
};

function runQuery(query: string): Record<string, unknown>[] {
  const q = query.trim().toLowerCase();
  // Basic SELECT * FROM table support
  const selectAll = q.match(/^select \* from (\w+)/);
  if (selectAll) {
    const table = selectAll[1] as keyof typeof DB;
    if (table in DB) return DB[table] as unknown as Record<string, unknown>[];
  }
  // Revenue by product
  if (q.includes('sum') && q.includes('amount') && q.includes('product')) {
    const rev: Record<string, number> = {};
    for (const o of DB.orders) { rev[o.product] = (rev[o.product] ?? 0) + o.amount; }
    return Object.entries(rev).map(([product, total]) => ({ product, total_revenue: total }));
  }
  // Customers per country
  if (q.includes('count') && q.includes('country')) {
    const counts: Record<string, number> = {};
    for (const c of DB.customers) { counts[c.country] = (counts[c.country] ?? 0) + 1; }
    return Object.entries(counts).map(([country, count]) => ({ country, customer_count: count }));
  }
  // Completed orders
  if (q.includes("status") && q.includes("completed")) {
    return DB.orders.filter((o) => o.status === 'completed') as unknown as Record<string, unknown>[];
  }
  // Fallback: return first matched table
  for (const table of ['customers', 'orders', 'products'] as const) {
    if (q.includes(table)) return DB[table] as unknown as Record<string, unknown>[];
  }
  return [{ message: 'Query executed (demo mode — complex queries return this placeholder)' }];
}

export const listTablesTool = createTool({
  id: 'sql-list-tables',
  description: 'List all tables in the database with their schema.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    tables: z.array(z.object({
      name: z.string(),
      columns: z.array(z.object({ name: z.string(), type: z.string() })),
      rowCount: z.number(),
    })),
  }),
  execute: async () => ({
    tables: [
      { name: 'customers', rowCount: DB.customers.length, columns: [{ name: 'id', type: 'INTEGER' }, { name: 'name', type: 'TEXT' }, { name: 'email', type: 'TEXT' }, { name: 'country', type: 'TEXT' }, { name: 'created_at', type: 'DATE' }] },
      { name: 'orders', rowCount: DB.orders.length, columns: [{ name: 'id', type: 'INTEGER' }, { name: 'customer_id', type: 'INTEGER' }, { name: 'product', type: 'TEXT' }, { name: 'amount', type: 'REAL' }, { name: 'status', type: 'TEXT' }, { name: 'date', type: 'DATE' }] },
      { name: 'products', rowCount: DB.products.length, columns: [{ name: 'id', type: 'INTEGER' }, { name: 'name', type: 'TEXT' }, { name: 'category', type: 'TEXT' }, { name: 'price', type: 'REAL' }, { name: 'stock', type: 'INTEGER' }] },
    ],
  }),
});

export const executeSqlTool = createTool({
  id: 'sql-execute-query',
  description: 'Execute a SQL SELECT query against the database.',
  inputSchema: z.object({ query: z.string().describe('SQL SELECT query to execute') }),
  outputSchema: z.object({
    rows: z.array(z.record(z.string(), z.unknown())),
    rowCount: z.number(),
    columns: z.array(z.string()),
  }),
  execute: async (inputData) => {
    const rows = runQuery(inputData.query);
    const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
    return { rows, rowCount: rows.length, columns };
  },
});
