-- The product was renamed from AERA to KindlyPay; the agent's actor identity follows it.
alter table public.collection_actions drop constraint if exists collection_actions_created_by_check;
update public.collection_actions set created_by = 'kindlypay' where created_by = 'aera';
alter table public.collection_actions add constraint collection_actions_created_by_check check (created_by in ('kindlypay','human','system'));

alter table public.audit_events drop constraint if exists audit_events_actor_type_check;
update public.audit_events set actor_type = 'kindlypay' where actor_type = 'aera';
alter table public.audit_events add constraint audit_events_actor_type_check check (actor_type in ('kindlypay','human','system'));
