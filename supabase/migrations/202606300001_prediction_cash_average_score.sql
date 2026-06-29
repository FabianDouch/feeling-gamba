alter table public.promotion_predictions
  add column if not exists cash_average_score numeric;
