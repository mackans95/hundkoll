-- A fourth, catch-all category: everything added from here on lands in
-- 'other' unless it obviously belongs to routine/care/health. The check
-- constraint is the one place a category exists in the schema; the union in
-- src/lib/types/domain.ts and the tile color in LogGrid.svelte mirror it.
alter table event_types drop constraint event_types_category_check;
alter table event_types add constraint event_types_category_check
	check (category in ('routine', 'care', 'health', 'other'));
