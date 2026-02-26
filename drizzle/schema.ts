import { boolean, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  price: numeric('price').notNull(),
  currency: text('currency').notNull(),
  unit: text('unit').notNull(),
  photos: jsonb('photos').$type<string[]>(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdateFn(() => new Date()),
});

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  tgUserId: text('tg_user_id').notNull(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  city: text('city').notNull(),
  message: text('message').notNull(),
  productId: uuid('product_id').references(() => products.id),
  status: text('status').notNull(),
  source: text('source').notNull(),
  assignedAdminId: uuid('assigned_admin_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdateFn(() => new Date()),
});

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  tgUserId: text('tg_user_id').notNull(),
  productId: uuid('product_id').references(() => products.id),
  qty: numeric('qty').notNull(),
  unit: text('unit').notNull(),
  address: text('address'),
  comment: text('comment'),
  status: text('status').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdateFn(() => new Date()),
});