import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'doggideed.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    username TEXT,
    model TEXT,
    height TEXT,
    volume TEXT,
    color TEXT,
    total_price INTEGER,
    status TEXT DEFAULT 'pending',
    items_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS catalog_overrides (
    type TEXT, -- 'color' or 'model'
    item_id TEXT,
    available INTEGER,
    PRIMARY KEY (type, item_id)
  );

  CREATE TABLE IF NOT EXISTS custom_colors (
    id TEXT PRIMARY KEY,
    name TEXT
  );

  CREATE TABLE IF NOT EXISTS custom_prices (
    item_type TEXT, -- 'height' or 'volume_model'
    item_id TEXT, -- e.g. 'medium' or '400_classic'
    price INTEGER,
    PRIMARY KEY (item_type, item_id)
  );

  CREATE TABLE IF NOT EXISTS bot_users (
    id TEXT PRIMARY KEY,
    role TEXT -- 'admin' or 'manager'
  );
`);

export interface Order {
  id: string;
  userId: number;
  username?: string;
  model: string;
  height?: string;
  volume?: string;
  color?: string;
  itemsJson?: string;
  totalPrice: number;
  status: string;
}

export function createOrder(order: Partial<Order>) {
  // If the column doesn't exist yet, we add it dynamically (safe for existing DBs)
  try {
    db.exec('ALTER TABLE orders ADD COLUMN items_json TEXT');
  } catch (e) {
    // Column might already exist
  }

  const stmt = db.prepare(`
    INSERT INTO orders (id, user_id, username, model, height, volume, color, total_price, items_json)
    VALUES (@id, @userId, @username, @model, @height, @volume, @color, @totalPrice, @itemsJson)
  `);
  stmt.run({
    id: order.id,
    userId: order.userId,
    username: order.username || null,
    model: order.model || null,
    height: order.height || null,
    volume: order.volume || null,
    color: order.color || null,
    totalPrice: order.totalPrice,
    itemsJson: order.itemsJson || null,
  });
}

export function getOrder(id: string): Order | undefined {
  const stmt = db.prepare('SELECT * FROM orders WHERE id = ?');
  const row = stmt.get(id) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    model: row.model,
    height: row.height,
    volume: row.volume,
    color: row.color,
    itemsJson: row.items_json,
    totalPrice: row.total_price,
    status: row.status,
  };
}

export function markPaid(id: string) {
  const stmt = db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?");
  stmt.run(id);
}

export function getRecentPaidOrders(limit: number = 10): Order[] {
  const stmt = db.prepare("SELECT * FROM orders WHERE status = 'paid' ORDER BY created_at DESC LIMIT ?");
  return stmt.all(limit).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    model: row.model,
    height: row.height,
    volume: row.volume,
    color: row.color,
    itemsJson: row.items_json,
    totalPrice: row.total_price,
    status: row.status,
  }));
}

export function getStats() {
  const stmt = db.prepare("SELECT COUNT(*) as total_orders, SUM(total_price) as total_revenue FROM orders WHERE status = 'paid'");
  const stats = stmt.get() as { total_orders: number, total_revenue: number };
  return {
    totalOrders: stats.total_orders,
    totalRevenue: stats.total_revenue || 0,
  };
}

export function getOverrides() {
  const stmt = db.prepare("SELECT * FROM catalog_overrides");
  return stmt.all();
}

export function setOverride(type: 'color' | 'model', itemId: string, available: boolean) {
  const stmt = db.prepare(`
    INSERT INTO catalog_overrides (type, item_id, available)
    VALUES (@type, @itemId, @available)
    ON CONFLICT(type, item_id) DO UPDATE SET available = excluded.available
  `);
  stmt.run({ type, itemId, available: available ? 1 : 0 });
}

export function isItemAvailable(type: 'color' | 'model', itemId: string, defaultAvailable: boolean): boolean {
  const stmt = db.prepare("SELECT available FROM catalog_overrides WHERE type = ? AND item_id = ?");
  const row = stmt.get(type, itemId) as { available: number } | undefined;
  if (row !== undefined) {
    return row.available === 1;
  }
  return defaultAvailable;
}

export function getCustomColors(): { id: string, name: string }[] {
  return db.prepare("SELECT * FROM custom_colors").all() as any;
}

export function addCustomColor(id: string, name: string) {
  const stmt = db.prepare("INSERT OR REPLACE INTO custom_colors (id, name) VALUES (?, ?)");
  stmt.run(id, name);
}

export function deleteCustomColor(id: string) {
  db.prepare("DELETE FROM custom_colors WHERE id = ?").run(id);
  db.prepare("DELETE FROM catalog_overrides WHERE type = 'color' AND item_id = ?").run(id);
}

export function getCustomPrices(): { item_type: string, item_id: string, price: number }[] {
  return db.prepare("SELECT * FROM custom_prices").all() as any;
}

export function setCustomPrice(item_type: string, item_id: string, price: number) {
  const stmt = db.prepare("INSERT OR REPLACE INTO custom_prices (item_type, item_id, price) VALUES (?, ?, ?)");
  stmt.run(item_type, item_id, price);
}

// Access Control
export function getBotUsers(): { id: string, role: string }[] {
  return db.prepare("SELECT * FROM bot_users").all() as any;
}

export function addBotUser(id: string, role: 'admin' | 'manager') {
  const stmt = db.prepare("INSERT OR REPLACE INTO bot_users (id, role) VALUES (?, ?)");
  stmt.run(id, role);
}

export function removeBotUser(id: string) {
  db.prepare("DELETE FROM bot_users WHERE id = ?").run(id);
}

export function getUserRole(id: string): 'admin' | 'manager' | null {
  const row = db.prepare("SELECT role FROM bot_users WHERE id = ?").get(id) as any;
  if (!row) {
    // Check .env fallback
    const envAdmins = (process.env.ADMIN_CHAT_ID || '').split(',').map((x: string) => x.trim());
    if (envAdmins.includes(id.toString())) return 'admin';
    return null;
  }
  return row.role;
}

export function getAllStaffIds(): string[] {
  const users = getBotUsers().map(u => u.id);
  const envAdmins = (process.env.ADMIN_CHAT_ID || '').split(',').map((x: string) => x.trim()).filter(Boolean);
  return Array.from(new Set([...users, ...envAdmins]));
}
