-- Retire the four wide stats views. Every column they had is reproduced from
-- the generic four added in the previous migration — verified column by column
-- against the production snapshot, with both sets live in one database, before
-- this file was written.
--
-- Separate from the create so that check was possible at all. The only number
-- that changes is a share over a count field: the old share asked whether the
-- stored value was literally `true`, so a walk with pee: 2 read as 0 %.

drop view stats_detail_metrics;
drop view stats_period_summary;
drop view stats_accident_bins;
drop view stats_daily_counts;
drop view stats_summary;
