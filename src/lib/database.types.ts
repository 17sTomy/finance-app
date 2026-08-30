export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

interface BaseRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface UserPreferencesRow extends Record<string, unknown> {
  user_id: string;
  selected_month: string;
  show_amounts: boolean;
  finance_revision: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryRow extends BaseRow { name: string; icon: string; color: string; kind: string }
export interface FixedExpenseRow extends BaseRow {
  name: string; amount: number; currency: string; category_id: string | null; start_date: string; due_day: number;
  duration_type: string; duration_count: number | null; duration_end_date: string | null; reminder_enabled: boolean; notes: string | null; active: boolean;
}
export interface RecurringIncomeRow extends BaseRow { name: string; amount: number; currency: string; start_date: string; active: boolean }
export interface InstallmentPlanRow extends BaseRow {
  description: string; total_amount: number; installment_count: number; first_installment_date: string; currency: string; category_id: string | null; notes: string | null;
}
export interface SavingsGoalRow extends BaseRow {
  name: string; target_amount: number; target_mode: string; salary_percentage: number | null; currency: string; target_date: string | null; color: string;
}
export interface TransactionRow extends BaseRow {
  name: string; amount: number; currency: string; transaction_date: string; type: string; expense_type: string | null; category_id: string | null; notes: string | null;
  fixed_expense_id: string | null; recurring_income_id: string | null; installment_plan_id: string | null; installment_number: number | null; installment_count: number | null;
  investment_ticker: string | null; investment_quantity: number | null; asset_action: string | null; exchange_rate: number | null; goal_id: string | null;
}
export interface MonthlyLimitRow extends BaseRow { month: string; category_id: string; percentage: number | null; amount: number | null; currency: string }
export interface CalendarEventRow extends BaseRow { title: string; event_date: string; description: string | null; type: string }
export interface GoalContributionRow extends BaseRow { goal_id: string; transaction_id: string | null; amount: number; contribution_date: string }

type TableDefinition<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      user_preferences: TableDefinition<UserPreferencesRow, Partial<UserPreferencesRow>>;
      categories: TableDefinition<CategoryRow>;
      fixed_expenses: TableDefinition<FixedExpenseRow>;
      recurring_incomes: TableDefinition<RecurringIncomeRow>;
      installment_plans: TableDefinition<InstallmentPlanRow>;
      savings_goals: TableDefinition<SavingsGoalRow>;
      transactions: TableDefinition<TransactionRow>;
      monthly_limits: TableDefinition<MonthlyLimitRow>;
      calendar_events: TableDefinition<CalendarEventRow>;
      goal_contributions: TableDefinition<GoalContributionRow>;
    };
    Views: Record<string, never>;
    Functions: {
      get_finance_data: { Args: Record<string, never>; Returns: Json };
      replace_finance_data: { Args: { p_data: Json; p_expected_revision: number }; Returns: number };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
