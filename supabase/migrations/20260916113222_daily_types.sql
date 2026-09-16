-- make these 2 types track by average
update event_types
set
  interval_type = 'average'
where
  id in ('walk', 'meal');