-- ADMIN RECOVERY — run in Supabase SQL Editor.
-- Makes the account that signed in MOST RECENTLY an active administrator,
-- then lists every account so you can check the result.
-- (Sign in to the app first, then run this immediately.)

ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard;

UPDATE public.profiles
SET role = 'admin', active = true
WHERE id = (
  SELECT id FROM auth.users
  WHERE last_sign_in_at IS NOT NULL
  ORDER BY last_sign_in_at DESC
  LIMIT 1
);

ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard;

SELECT p.email,
       p.role,
       p.active,
       (u.email_confirmed_at IS NOT NULL) AS email_confirmed,
       u.last_sign_in_at,
       p.created_at
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
ORDER BY p.created_at;
