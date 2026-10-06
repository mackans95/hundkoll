-- Whether a type shows on Status at all (plan 26). Off also silences its
-- reminders: the remind function reads this as service_role, whose grant
-- covers the whole table. Null means the default, shown.
alter table type_settings add column show_on_status boolean;

grant update (show_on_status) on type_settings to authenticated;
