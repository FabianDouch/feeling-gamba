insert into public.profiles (
  id,
  email,
  display_name,
  avatar_url
)
select
  users.id,
  users.email,
  coalesce(users.raw_user_meta_data ->> 'full_name', users.raw_user_meta_data ->> 'name'),
  users.raw_user_meta_data ->> 'avatar_url'
from auth.users
on conflict (id) do update
set
  email = excluded.email,
  display_name = coalesce(profiles.display_name, excluded.display_name),
  avatar_url = coalesce(profiles.avatar_url, excluded.avatar_url);
