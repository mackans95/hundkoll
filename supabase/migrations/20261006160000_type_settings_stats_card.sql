-- How a type's Statistik card looks (plan 29): its tiles now, its chart kind
-- next. Null means the type's default (src/lib/stats/cardSpec.ts), and the
-- value is validated against DETAIL_FIELDS on read, so a removed field drops
-- out rather than breaking the card.
alter table type_settings add column stats_card jsonb;

grant update (stats_card) on type_settings to authenticated;
