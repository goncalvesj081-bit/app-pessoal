alter table public.transactions add column raw_description text check (raw_description is null or char_length(raw_description) <= 500);
