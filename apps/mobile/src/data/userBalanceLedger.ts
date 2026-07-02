import { supabaseClient } from "./supabaseClient";

export type BalanceEventType = "deposit" | "initial" | "manual_update" | "withdrawal";

export type UserBalanceAccount = {
  currency: string;
  currentBalance: number;
  id: string;
  initialBalance: number;
  openedAt: string;
  updatedAt: string;
};

export type UserBalanceEvent = {
  amount: number;
  balanceAfter: number;
  balanceDelta: number;
  eventType: BalanceEventType;
  id: string;
  note: string | null;
  occurredAt: string;
};

export type UserBalanceLedger = {
  account: UserBalanceAccount | null;
  events: UserBalanceEvent[];
};

export type CreateBalanceAccountInput = {
  currency?: string;
  initialBalance: number;
  note?: string;
};

export type AddBalanceEventInput = {
  amount?: number;
  balanceAfter?: number;
  eventType: Exclude<BalanceEventType, "initial">;
  note?: string;
};

type BalanceAccountRow = {
  currency: string;
  current_balance: number | string;
  id: string;
  initial_balance: number | string;
  opened_at: string;
  updated_at: string;
};

type BalanceEventRow = {
  amount: number | string;
  balance_after: number | string;
  balance_delta: number | string;
  event_type: BalanceEventType;
  id: string;
  note: string | null;
  occurred_at: string;
};

const BALANCE_ACCOUNT_SELECT = [
  "id",
  "currency",
  "initial_balance",
  "current_balance",
  "opened_at",
  "updated_at",
].join(",");

const BALANCE_EVENT_SELECT = [
  "id",
  "event_type",
  "amount",
  "balance_delta",
  "balance_after",
  "note",
  "occurred_at",
].join(",");

/**
 * Reads the signed-in user's manual balance account and event history through RLS.
 */
export async function fetchUserBalanceLedger(): Promise<UserBalanceLedger> {
  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { data: accountRows, error: accountError } = await supabaseClient
    .from("user_balance_accounts")
    .select(BALANCE_ACCOUNT_SELECT)
    .order("created_at", { ascending: true })
    .limit(1)
    .returns<BalanceAccountRow[]>();

  if (accountError) {
    throw new Error(accountError.message);
  }

  const account = accountRows?.[0] ? mapBalanceAccount(accountRows[0]) : null;

  if (!account) {
    return {
      account: null,
      events: [],
    };
  }

  const { data: eventRows, error: eventError } = await supabaseClient
    .from("user_balance_events")
    .select(BALANCE_EVENT_SELECT)
    .eq("account_id", account.id)
    .order("occurred_at", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500)
    .returns<BalanceEventRow[]>();

  if (eventError) {
    throw new Error(eventError.message);
  }

  return {
    account,
    events: (eventRows ?? []).map(mapBalanceEvent),
  };
}

/**
 * Creates the user's balance account and first immutable ledger event.
 */
export async function createUserBalanceAccount(input: CreateBalanceAccountInput) {
  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { error } = await supabaseClient.rpc("create_user_balance_account", {
    p_currency: input.currency ?? "NZD",
    p_initial_balance: input.initialBalance,
    p_note: input.note ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Adds a deposit, withdrawal, or manual balance correction as one ledger event.
 */
export async function addUserBalanceEvent(input: AddBalanceEventInput) {
  if (!supabaseClient) {
    throw new Error("Supabase auth client is not configured.");
  }

  const { error } = await supabaseClient.rpc("add_user_balance_event", {
    p_amount: input.amount ?? null,
    p_balance_after: input.balanceAfter ?? null,
    p_event_type: input.eventType,
    p_note: input.note ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export function formatBalanceCurrency(value: number | null | undefined, currency = "NZD") {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("en-NZ", {
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function mapBalanceAccount(row: BalanceAccountRow): UserBalanceAccount {
  return {
    currency: row.currency,
    currentBalance: Number(row.current_balance),
    id: row.id,
    initialBalance: Number(row.initial_balance),
    openedAt: row.opened_at,
    updatedAt: row.updated_at,
  };
}

function mapBalanceEvent(row: BalanceEventRow): UserBalanceEvent {
  return {
    amount: Number(row.amount),
    balanceAfter: Number(row.balance_after),
    balanceDelta: Number(row.balance_delta),
    eventType: row.event_type,
    id: row.id,
    note: row.note,
    occurredAt: row.occurred_at,
  };
}
