# Phase 1 Setup — Supabase

Run these steps in order. Each step has a verify check — don't move on until it passes.

---

## Step 1 — Apply the schema

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the entire contents of `schema.sql`.
3. Click **Run**. You should see `Success. No rows returned`.

**Verify:** Go to **Table Editor**. You should see 7 tables:
`admins`, `categories`, `product_categories`, `products`, `questions`, `reviews`, `settings`.
The `settings` table should already have one row (id=1) with default branding.

---

## Step 2 — Create your admin user

1. Go to **Authentication → Users → Add user → Create new user**.
2. Enter your email + a password. Tick **Auto Confirm User**.
3. Copy the user's **UID** from the user list.
4. Back in **SQL Editor**, run:

   ```sql
   insert into public.admins (user_id) values ('PASTE-UID-HERE');
   ```

**Verify:** Run `select * from public.admins;` — you should see one row with your UID.

---

## Step 3 — Confirm storage buckets

1. Go to **Storage**. You should see two public buckets: `products` and `branding`.
2. Click each → the lock icon should show **Public**.

---

## Step 4 — Sanity-check RLS

In **SQL Editor**, run:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public';
```

Every row should have `rowsecurity = true`. If any are `false`, the schema didn't fully apply — re-run `schema.sql`.

---

## Step 5 — Verify your URL + anon key match

You sent me:
- URL: `https://qtlqwirpwaigtkxbcsci.supabase.co`
- Anon key project ref: `qtlqvwirpwaigtkxbsci` (decoded from the JWT)

These don't match — likely a copy-paste typo. Open **Project Settings → API** and confirm the URL and the anon key both come from the same project. Send me the corrected values before Phase 2.

---

When all five steps pass, reply **"phase 1 done"** and I'll start Phase 2 (project scaffold + public site).
