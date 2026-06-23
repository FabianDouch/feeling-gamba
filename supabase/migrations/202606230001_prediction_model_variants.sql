alter table public.promotion_predictions
  add column if not exists prediction_model text not null default 'global_bucket_blend_v1';

alter table public.prediction_aggregates
  add column if not exists prediction_model text not null default 'global_bucket_blend_v1';

update public.prediction_aggregates
set scope_key = prediction_model || ':' || scope_key
where scope_key not like prediction_model || ':%';

alter table public.promotion_predictions
  drop constraint if exists promotion_predictions_source_source_race_card_id_key;

alter table public.promotion_predictions
  add constraint promotion_predictions_model_source_race_card_key
  unique (prediction_model, source, source_race_card_id);

create index if not exists promotion_predictions_model_source_date_idx
  on public.promotion_predictions (prediction_model, source_date desc, source, race_code);

create index if not exists prediction_aggregates_model_lookup_idx
  on public.prediction_aggregates (prediction_model, scope_type, race_code);
