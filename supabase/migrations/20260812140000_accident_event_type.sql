-- Replace the standalone poop type with an indoor-accident type. Outdoor
-- poops are recorded as counts on the walk event instead; 'accident' means
-- pee or poop inside.

insert into event_types (id, label, category, interval_days, icon, sort_order)
values ('accident', 'Olycka', 'routine', null, '⚠️', 30);

-- Keep any rows logged as 'poop' rather than dropping data; review/delete by
-- hand if they were test taps.
update events set type_id = 'accident' where type_id = 'poop';

delete from event_types where id = 'poop';
