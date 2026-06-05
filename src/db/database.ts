import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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
  bowlName?: string;
}

export interface ContentBlock {
  id: string;
  text?: string;
  photo_id?: string; // Comma-separated list of photo IDs
  button_text?: string;
  button_url?: string;
}

const cache = {
  orders: new Map<string, Order>(),
  catalog_overrides: new Map<string, number>(),
  custom_colors: new Map<string, string>(),
  custom_prices: new Map<string, number>(),
  bot_users: new Map<string, string>(),
  content_blocks: new Map<string, ContentBlock>(),
  settings: new Map<string, string>(),
  ordersArray: [] as Order[] // for chronological queries
};

export async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      username TEXT,
      model TEXT,
      height TEXT,
      volume TEXT,
      color TEXT,
      total_price INTEGER,
      status TEXT DEFAULT 'pending',
      items_json TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS bowl_name TEXT;
    CREATE TABLE IF NOT EXISTS catalog_overrides (
      type TEXT,
      item_id TEXT,
      available INTEGER,
      PRIMARY KEY (type, item_id)
    );
    CREATE TABLE IF NOT EXISTS custom_colors (
      id TEXT PRIMARY KEY,
      name TEXT
    );
    CREATE TABLE IF NOT EXISTS custom_prices (
      item_type TEXT,
      item_id TEXT,
      price INTEGER,
      PRIMARY KEY (item_type, item_id)
    );
    CREATE TABLE IF NOT EXISTS bot_users (
      id TEXT PRIMARY KEY,
      role TEXT
    );
    CREATE TABLE IF NOT EXISTS content_blocks (
      id TEXT PRIMARY KEY,
      text TEXT,
      photo_id TEXT,
      button_text TEXT,
      button_url TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  const orders = await pool.query('SELECT * FROM orders ORDER BY created_at ASC');
  orders.rows.forEach(r => {
    const o = {
      id: r.id, userId: Number(r.user_id), username: r.username, model: r.model,
      height: r.height, volume: r.volume, color: r.color, itemsJson: r.items_json,
      totalPrice: r.total_price, status: r.status, bowlName: r.bowl_name
    };
    cache.orders.set(r.id, o);
    cache.ordersArray.push(o);
  });

  const overrides = await pool.query('SELECT * FROM catalog_overrides');
  overrides.rows.forEach(r => cache.catalog_overrides.set(`${r.type}_${r.item_id}`, r.available));

  const colors = await pool.query('SELECT * FROM custom_colors');
  colors.rows.forEach(r => cache.custom_colors.set(r.id, r.name));

  const prices = await pool.query('SELECT * FROM custom_prices');
  prices.rows.forEach(r => cache.custom_prices.set(`${r.item_type}_${r.item_id}`, r.price));

  const users = await pool.query('SELECT * FROM bot_users');
  users.rows.forEach(r => cache.bot_users.set(r.id, r.role));

  const blocks = await pool.query('SELECT * FROM content_blocks');
  blocks.rows.forEach(r => cache.content_blocks.set(r.id, {
    id: r.id, text: r.text, photo_id: r.photo_id, button_text: r.button_text, button_url: r.button_url
  }));

  const settings = await pool.query('SELECT * FROM settings');
  settings.rows.forEach(r => cache.settings.set(r.key, r.value));
}

export function createOrder(order: Partial<Order>) {
  const o = {
    id: order.id!, userId: order.userId!, username: order.username, model: order.model || '',
    height: order.height, volume: order.volume, color: order.color, itemsJson: order.itemsJson,
    totalPrice: order.totalPrice || 0, status: order.status || 'pending',
    bowlName: order.bowlName
  };
  cache.orders.set(o.id, o);
  cache.ordersArray.push(o);

  pool.query(`
    INSERT INTO orders (id, user_id, username, model, height, volume, color, total_price, items_json, bowl_name)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [o.id, o.userId, o.username, o.model, o.height, o.volume, o.color, o.totalPrice, o.itemsJson, o.bowlName]).catch(console.error);
}

export function getOrder(id: string): Order | undefined {
  return cache.orders.get(id);
}

export function markPaid(id: string) {
  const o = cache.orders.get(id);
  if (o) o.status = 'paid';
  pool.query("UPDATE orders SET status = 'paid' WHERE id = $1", [id]).catch(console.error);
}

export function getRecentPaidOrders(limit: number = 10): Order[] {
  return cache.ordersArray.filter(o => o.status === 'paid').slice(-limit).reverse();
}

export function getStats() {
  const paid = cache.ordersArray.filter(o => o.status === 'paid');
  return {
    totalOrders: paid.length,
    totalRevenue: paid.reduce((sum, o) => sum + o.totalPrice, 0)
  };
}

export function getOverrides() {
  return Array.from(cache.catalog_overrides.entries()).map(([k, v]) => {
    const [type, item_id] = k.split('_');
    return { type, item_id, available: v };
  });
}

export function setOverride(type: 'color' | 'model', itemId: string, available: boolean) {
  cache.catalog_overrides.set(`${type}_${itemId}`, available ? 1 : 0);
  pool.query(`
    INSERT INTO catalog_overrides (type, item_id, available)
    VALUES ($1, $2, $3)
    ON CONFLICT(type, item_id) DO UPDATE SET available = EXCLUDED.available
  `, [type, itemId, available ? 1 : 0]).catch(console.error);
}

export function isItemAvailable(type: 'color' | 'model', itemId: string, defaultAvailable: boolean): boolean {
  const val = cache.catalog_overrides.get(`${type}_${itemId}`);
  if (val !== undefined) return val === 1;
  return defaultAvailable;
}

export function getCustomColors(): { id: string, name: string }[] {
  return Array.from(cache.custom_colors.entries()).map(([id, name]) => ({ id, name }));
}

export function addCustomColor(id: string, name: string) {
  cache.custom_colors.set(id, name);
  pool.query(`
    INSERT INTO custom_colors (id, name) VALUES ($1, $2)
    ON CONFLICT(id) DO UPDATE SET name = EXCLUDED.name
  `, [id, name]).catch(console.error);
}

export function deleteCustomColor(id: string) {
  cache.custom_colors.delete(id);
  cache.catalog_overrides.delete(`color_${id}`);
  pool.query("DELETE FROM custom_colors WHERE id = $1", [id]).catch(console.error);
  pool.query("DELETE FROM catalog_overrides WHERE type = 'color' AND item_id = $1", [id]).catch(console.error);
}

export function getCustomPrices(): { item_type: string, item_id: string, price: number }[] {
  return Array.from(cache.custom_prices.entries()).map(([k, price]) => {
    const [item_type, item_id] = k.split('_');
    return { item_type, item_id, price };
  });
}

export function setCustomPrice(item_type: string, item_id: string, price: number) {
  cache.custom_prices.set(`${item_type}_${item_id}`, price);
  pool.query(`
    INSERT INTO custom_prices (item_type, item_id, price) VALUES ($1, $2, $3)
    ON CONFLICT(item_type, item_id) DO UPDATE SET price = EXCLUDED.price
  `, [item_type, item_id, price]).catch(console.error);
}

export function getBotUsers(): { id: string, role: string }[] {
  return Array.from(cache.bot_users.entries()).map(([id, role]) => ({ id, role }));
}

export function addBotUser(id: string, role: 'admin' | 'manager') {
  cache.bot_users.set(id, role);
  pool.query(`
    INSERT INTO bot_users (id, role) VALUES ($1, $2)
    ON CONFLICT(id) DO UPDATE SET role = EXCLUDED.role
  `, [id, role]).catch(console.error);
}

export function removeBotUser(id: string) {
  cache.bot_users.delete(id);
  pool.query("DELETE FROM bot_users WHERE id = $1", [id]).catch(console.error);
}

export function getUserRole(id: string): 'admin' | 'manager' | null {
  const role = cache.bot_users.get(id);
  if (role) return role as any;
  const envAdmins = (process.env.ADMIN_CHAT_ID || '').split(',').map((x: string) => x.trim());
  if (envAdmins.includes(id.toString())) return 'admin';
  return null;
}

export function getAllStaffIds(): string[] {
  const users = Array.from(cache.bot_users.keys());
  const envAdmins = (process.env.ADMIN_CHAT_ID || '').split(',').map((x: string) => x.trim()).filter(Boolean);
  return Array.from(new Set([...users, ...envAdmins]));
}

export function getContentBlock(id: string): ContentBlock | undefined {
  return cache.content_blocks.get(id);
}

export function setContentBlock(id: string, text: string | null, photo_id: string | null, button_text: string | null, button_url: string | null) {
  cache.content_blocks.set(id, { id, text: text || undefined, photo_id: photo_id || undefined, button_text: button_text || undefined, button_url: button_url || undefined });
  pool.query(`
    INSERT INTO content_blocks (id, text, photo_id, button_text, button_url)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT(id) DO UPDATE SET 
      text = EXCLUDED.text,
      photo_id = EXCLUDED.photo_id,
      button_text = EXCLUDED.button_text,
      button_url = EXCLUDED.button_url
  `, [id, text, photo_id, button_text, button_url]).catch(console.error);
}

export function getSetting(key: string, defaultValue: string = ''): string {
  return cache.settings.get(key) || defaultValue;
}

export function setSetting(key: string, value: string) {
  cache.settings.set(key, value);
  pool.query(`
    INSERT INTO settings (key, value) VALUES ($1, $2)
    ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
  `, [key, value]).catch(console.error);
}
