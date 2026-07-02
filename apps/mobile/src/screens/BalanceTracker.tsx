import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";

import {
  addUserBalanceEvent,
  createUserBalanceAccount,
  fetchUserBalanceLedger,
  formatBalanceCurrency,
  type BalanceEventType,
  type UserBalanceLedger,
} from "../data/userBalanceLedger";

type BalanceAction = "deposit" | "manual_update" | "withdrawal";

const BALANCE_ACTIONS = [
  { label: "Deposit", value: "deposit" },
  { label: "Withdrawal", value: "withdrawal" },
  { label: "Update", value: "manual_update" },
] satisfies { label: string; value: BalanceAction }[];

/**
 * Lets signed-in users maintain a manual personal balance ledger.
 */
export function BalanceTracker() {
  const [ledger, setLedger] = useState<UserBalanceLedger>({
    account: null,
    events: [],
  });
  const [activeAction, setActiveAction] = useState<BalanceAction>("deposit");
  const [amountInput, setAmountInput] = useState("");
  const [initialBalanceInput, setInitialBalanceInput] = useState("");
  const [manualBalanceInput, setManualBalanceInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const latestEvents = useMemo(() => ledger.events.slice(-6).reverse(), [ledger.events]);

  useEffect(() => {
    let isActive = true;

    async function loadLedger() {
      try {
        setIsLoading(true);
        setErrorMessage(null);
        const nextLedger = await fetchUserBalanceLedger();

        if (isActive) {
          setLedger(nextLedger);
        }
      } catch (error) {
        if (isActive) {
          setErrorMessage(error instanceof Error ? error.message : "Could not load balance ledger.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadLedger();

    return () => {
      isActive = false;
    };
  }, []);

  /**
   * Refreshes the owner-scoped ledger after an insert RPC succeeds.
   */
  async function reloadLedger() {
    setLedger(await fetchUserBalanceLedger());
  }

  /**
   * Creates the opening balance and first chart point.
   */
  async function saveInitialBalance() {
    const initialBalance = parseMoneyInput(initialBalanceInput);

    if (initialBalance === null) {
      setErrorMessage("Enter a valid initial balance.");
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);
      setMessage(null);
      await createUserBalanceAccount({
        initialBalance,
        note: noteInput,
      });
      await reloadLedger();
      setInitialBalanceInput("");
      setNoteInput("");
      setMessage("Initial balance saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save initial balance.");
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Adds a balance movement or correction and stores the resulting balance point.
   */
  async function saveBalanceEvent() {
    const amount = parseMoneyInput(amountInput);
    const balanceAfter = parseMoneyInput(manualBalanceInput);

    if (activeAction === "manual_update" && balanceAfter === null) {
      setErrorMessage("Enter the updated balance.");
      return;
    }

    if (activeAction !== "manual_update" && amount === null) {
      setErrorMessage("Enter a valid amount.");
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);
      setMessage(null);
      await addUserBalanceEvent({
        amount: activeAction === "manual_update" ? undefined : amount ?? undefined,
        balanceAfter: activeAction === "manual_update" ? balanceAfter ?? undefined : undefined,
        eventType: activeAction,
        note: noteInput,
      });
      await reloadLedger();
      setAmountInput("");
      setManualBalanceInput("");
      setNoteInput("");
      setMessage("Balance event saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save balance event.");
    } finally {
      setIsSaving(false);
    }
  }

  const account = ledger.account;

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionHeading}>Balance tracker</Text>
          <Text style={styles.helperText}>Manual personal ledger for deposits, withdrawals, and balance updates.</Text>
        </View>
        {account ? (
          <View style={styles.balanceBadge}>
            <Text style={styles.balanceBadgeLabel}>Current</Text>
            <Text style={styles.balanceBadgeValue}>
              {formatBalanceCurrency(account.currentBalance, account.currency)}
            </Text>
          </View>
        ) : null}
      </View>

      {isLoading ? (
        <Text style={styles.helperText}>Loading balance ledger.</Text>
      ) : account ? (
        <>
          <BalanceLineGraph
            currency={account.currency}
            events={ledger.events}
          />

          <View style={styles.toggleRow}>
            {BALANCE_ACTIONS.map((action) => {
              const isActive = action.value === activeAction;

              return (
                <Pressable
                  key={action.value}
                  onPress={() => setActiveAction(action.value)}
                  style={[styles.toggleButton, isActive ? styles.toggleButtonActive : null]}
                >
                  <Text style={[styles.toggleButtonText, isActive ? styles.toggleButtonTextActive : null]}>
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {activeAction === "manual_update" ? (
            <MoneyInput
              label="Updated balance"
              onChangeText={setManualBalanceInput}
              placeholder="125.00"
              value={manualBalanceInput}
            />
          ) : (
            <MoneyInput
              label={activeAction === "deposit" ? "Deposit amount" : "Withdrawal amount"}
              onChangeText={setAmountInput}
              placeholder="25.00"
              value={amountInput}
            />
          )}

          <TextInput
            onChangeText={setNoteInput}
            placeholder="Optional note"
            placeholderTextColor="#98a2b3"
            style={styles.input}
            value={noteInput}
          />
          <Pressable
            disabled={isSaving}
            onPress={saveBalanceEvent}
            style={[styles.primaryButton, isSaving ? styles.buttonDisabled : null]}
          >
            <Text style={styles.primaryButtonText}>
              {isSaving ? "Saving" : "Save balance event"}
            </Text>
          </Pressable>

          <Text style={styles.subheading}>Recent events</Text>
          {latestEvents.length ? latestEvents.map((event) => (
            <View key={event.id} style={styles.eventRow}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{formatEventType(event.eventType)}</Text>
                <Text style={styles.rowMeta}>
                  {formatSignedCurrency(event.balanceDelta, account.currency)} · balance {formatBalanceCurrency(event.balanceAfter, account.currency)}
                </Text>
                <Text style={styles.rowMeta}>{formatLedgerDate(event.occurredAt)}{event.note ? ` · ${event.note}` : ""}</Text>
              </View>
            </View>
          )) : (
            <Text style={styles.helperText}>No balance events yet.</Text>
          )}
        </>
      ) : (
        <>
          <Text style={styles.helperText}>
            Set an opening balance to start the line graph. Future deposits, withdrawals, and updates will add points.
          </Text>
          <MoneyInput
            label="Initial balance"
            onChangeText={setInitialBalanceInput}
            placeholder="100.00"
            value={initialBalanceInput}
          />
          <TextInput
            onChangeText={setNoteInput}
            placeholder="Optional note"
            placeholderTextColor="#98a2b3"
            style={styles.input}
            value={noteInput}
          />
          <Pressable
            disabled={isSaving}
            onPress={saveInitialBalance}
            style={[styles.primaryButton, isSaving ? styles.buttonDisabled : null]}
          >
            <Text style={styles.primaryButtonText}>
              {isSaving ? "Saving" : "Set initial balance"}
            </Text>
          </Pressable>
        </>
      )}

      {message ? (
        <View style={[styles.messageBox, styles.successBox]}>
          <Text style={styles.successText}>{message}</Text>
        </View>
      ) : null}
      {errorMessage ? (
        <View style={[styles.messageBox, styles.errorBox]}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

type MoneyInputProps = {
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
};

/**
 * Renders a numeric currency input with consistent label spacing.
 */
function MoneyInput({ label, onChangeText, placeholder, value }: MoneyInputProps) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        keyboardType="decimal-pad"
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#98a2b3"
        style={styles.input}
        value={value}
      />
    </View>
  );
}

type BalanceLineGraphProps = {
  currency: string;
  events: UserBalanceLedger["events"];
};

/**
 * Draws a compact balance history chart without extra native dependencies.
 */
function BalanceLineGraph({ currency, events }: BalanceLineGraphProps) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = Math.max(240, Math.min(screenWidth - 72, 680));
  const chartHeight = 136;
  const plotWidth = chartWidth - 28;
  const plotHeight = chartHeight - 38;
  const points = events.map((event) => event.balanceAfter);
  const minValue = Math.min(...points, 0);
  const maxValue = Math.max(...points, 1);
  const range = Math.max(maxValue - minValue, 1);
  const coordinates = events.map((event, index) => ({
    event,
    x: events.length === 1 ? plotWidth / 2 : (index / (events.length - 1)) * plotWidth,
    y: plotHeight - ((event.balanceAfter - minValue) / range) * plotHeight,
  }));

  if (!events.length) {
    return (
      <View style={[styles.chart, { width: chartWidth }]}>
        <Text style={styles.chartEmpty}>No balance history yet.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.chart, { height: chartHeight, width: chartWidth }]}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartLabel}>{formatBalanceCurrency(maxValue, currency)}</Text>
        <Text style={styles.chartLabel}>{formatBalanceCurrency(minValue, currency)}</Text>
      </View>
      <View style={[styles.plotArea, { height: plotHeight, width: plotWidth }]}>
        {coordinates.slice(1).map((point, index) => {
          const previous = coordinates[index];
          const dx = point.x - previous.x;
          const dy = point.y - previous.y;
          const length = Math.sqrt((dx * dx) + (dy * dy));
          const angle = Math.atan2(dy, dx);

          return (
            <View
              key={`${point.event.id}-line`}
              style={[
                styles.chartLine,
                {
                  left: previous.x + (dx / 2) - (length / 2),
                  top: previous.y + (dy / 2) - 1,
                  transform: [
                    { rotate: `${angle}rad` },
                  ],
                  width: length,
                },
              ]}
            />
          );
        })}
        {coordinates.map((point) => (
          <View
            key={point.event.id}
            style={[
              styles.chartPoint,
              {
                left: point.x - 4,
                top: point.y - 4,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function parseMoneyInput(value: string) {
  const normalized = value.replace(/[$, ]/g, "");

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

function formatEventType(value: BalanceEventType) {
  const labels: Record<BalanceEventType, string> = {
    deposit: "Deposit",
    initial: "Initial balance",
    manual_update: "Manual update",
    withdrawal: "Withdrawal",
  };

  return labels[value];
}

function formatLedgerDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Pacific/Auckland",
  }).format(date);
}

function formatSignedCurrency(value: number, currency: string) {
  const prefix = value > 0 ? "+" : "";

  return `${prefix}${formatBalanceCurrency(value, currency)}`;
}

const styles = StyleSheet.create({
  balanceBadge: {
    alignItems: "flex-end",
    backgroundColor: "#f0f9ff",
    borderColor: "#bae6fd",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  balanceBadgeLabel: {
    color: "#026aa2",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  balanceBadgeValue: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 2,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  chart: {
    backgroundColor: "#f8fafc",
    borderColor: "#e4e7ec",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  chartEmpty: {
    color: "#667085",
    fontSize: 13,
    lineHeight: 18,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  chartLabel: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "800",
  },
  chartLine: {
    backgroundColor: "#175cd3",
    height: 2,
    position: "absolute",
  },
  chartPoint: {
    backgroundColor: "#175cd3",
    borderColor: "#ffffff",
    borderRadius: 5,
    borderWidth: 2,
    height: 10,
    position: "absolute",
    width: 10,
  },
  errorBox: {
    backgroundColor: "#fef3f2",
    borderColor: "#fecdca",
  },
  errorText: {
    color: "#b42318",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  eventRow: {
    borderColor: "#e4e7ec",
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 10,
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  helperText: {
    color: "#667085",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#d0d5dd",
    borderRadius: 6,
    borderWidth: 1,
    color: "#101828",
    fontSize: 14,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputGroup: {
    marginTop: 12,
  },
  inputLabel: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "900",
  },
  messageBox: {
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce7",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  plotArea: {
    marginTop: 10,
    position: "relative",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#175cd3",
    borderRadius: 6,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowMeta: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  rowTitle: {
    color: "#18202f",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
  },
  sectionHeading: {
    color: "#18202f",
    fontSize: 16,
    fontWeight: "900",
  },
  subheading: {
    color: "#18202f",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 18,
  },
  successBox: {
    backgroundColor: "#ecfdf3",
    borderColor: "#abefc6",
  },
  successText: {
    color: "#067647",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  toggleButton: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#d7dce7",
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  toggleButtonActive: {
    backgroundColor: "#18202f",
    borderColor: "#18202f",
  },
  toggleButtonText: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "900",
  },
  toggleButtonTextActive: {
    color: "#ffffff",
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
});
