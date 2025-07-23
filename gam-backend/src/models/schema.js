import { pgTable, uuid, varchar, text, jsonb, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).default('user'),
  settings: jsonb('settings').default({}),
  createdAt: timestamp('created_at').default(sql`NOW()`),
  updatedAt: timestamp('updated_at').default(sql`NOW()`),
  lastLogin: timestamp('last_login')
});

// Automations table
export const automations = pgTable('automations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  steps: jsonb('steps').default([]),
  config: jsonb('config').default({}),
  status: varchar('status', { length: 20 }).default('draft'),
  schedule: jsonb('schedule'),
  triggers: jsonb('triggers'),
  retryConfig: jsonb('retry_config'),
  enabled: boolean('enabled').default(true),
  isActive: boolean('is_active').default(true),
  userId: uuid('user_id').notNull().references(() => users.id),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  collaborators: jsonb('collaborators').default([]),
  createdAt: timestamp('created_at').default(sql`NOW()`),
  updatedAt: timestamp('updated_at').default(sql`NOW()`),
  version: integer('version').default(1)
});

// Executions table
export const executions = pgTable('executions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  automationId: uuid('automation_id').notNull().references(() => automations.id),
  status: varchar('status', { length: 20 }).default('pending'),
  inputData: jsonb('input_data'),
  outputData: jsonb('output_data'),
  logs: jsonb('logs').default([]),
  errorDetails: jsonb('error_details'),
  retryInfo: jsonb('retry_info'),
  startedAt: timestamp('started_at').default(sql`NOW()`),
  updatedAt: timestamp('updated_at').default(sql`NOW()`),
  completedAt: timestamp('completed_at'),
  durationMs: integer('duration_ms'),
  triggeredBy: varchar('triggered_by', { length: 50 })
});

// Automation shares table
export const automationShares = pgTable('automation_shares', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  automationId: uuid('automation_id').notNull().references(() => automations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  permission: varchar('permission', { length: 20 }).default('read'),
  createdAt: timestamp('created_at').default(sql`NOW()`)
});

// Templates table
export const templates = pgTable('templates', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 100 }),
  steps: jsonb('steps').notNull(),
  config: jsonb('config').default({}),
  isPublic: boolean('is_public').default(false),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').default(sql`NOW()`)
});

// System logs table
export const systemLogs = pgTable('system_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  level: varchar('level', { length: 20 }).notNull(),
  message: text('message').notNull(),
  metadata: jsonb('metadata'),
  userId: uuid('user_id').references(() => users.id),
  createdAt: timestamp('created_at').default(sql`NOW()`)
});

export default {
  users,
  automations,
  executions,
  automationShares,
  templates,
  systemLogs
};