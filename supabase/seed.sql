-- Optional sample data so the site has something to display before the
-- admin panel exists. Safe to skip; safe to re-run (idempotent on names).
-- Run in Supabase SQL Editor.

-- ---------- Categories ----------
insert into public.categories (name) values
  ('Apparel'),
  ('Footwear'),
  ('Accessories'),
  ('Electronics')
on conflict (name) do nothing;

-- ---------- Products ----------
-- Use picsum.photos for placeholder images so the grid looks real.
with new_products as (
  insert into public.products (name, description, price, stock, image_url)
  values
    ('Classic Tee',
     'Soft cotton t-shirt with a relaxed fit. Goes with everything.',
     19.99, 50, 'https://picsum.photos/seed/tee/600/600'),
    ('Hoodie Premium',
     'Heavyweight fleece hoodie. Brushed inside, drawstring hood.',
     49.00, 20, 'https://picsum.photos/seed/hoodie/600/600'),
    ('Runner Sneakers',
     'Lightweight running shoes with cushioned sole.',
     89.50, 15, 'https://picsum.photos/seed/sneakers/600/600'),
    ('Leather Belt',
     'Full-grain leather belt with brushed metal buckle.',
     29.00, 30, 'https://picsum.photos/seed/belt/600/600'),
    ('Wireless Headphones',
     'Over-ear headphones with active noise cancellation, 30hr battery.',
     149.00, 12, 'https://picsum.photos/seed/headphones/600/600'),
    ('Smartwatch',
     'Fitness tracking, notifications, 7-day battery, water resistant.',
     199.00, 8, 'https://picsum.photos/seed/watch/600/600')
  returning id, name
)
-- ---------- Product → Category links ----------
insert into public.product_categories (product_id, category_id)
select np.id, c.id
from new_products np
join public.categories c on c.name in (
  case np.name
    when 'Classic Tee'         then 'Apparel'
    when 'Hoodie Premium'      then 'Apparel'
    when 'Runner Sneakers'     then 'Footwear'
    when 'Leather Belt'        then 'Accessories'
    when 'Wireless Headphones' then 'Electronics'
    when 'Smartwatch'          then 'Electronics'
  end
)
on conflict do nothing;

-- ---------- A few sample reviews ----------
insert into public.reviews (product_id, user_name, rating, comment)
select p.id, 'Alice', 5, 'Exactly what I was looking for. Great quality.'
from public.products p where p.name = 'Classic Tee'
on conflict do nothing;

insert into public.reviews (product_id, user_name, rating, comment)
select p.id, 'Bob', 4, 'Comfortable and warm, sleeves run a bit long.'
from public.products p where p.name = 'Hoodie Premium'
on conflict do nothing;

-- ---------- A sample question ----------
insert into public.questions (product_id, question, answer)
select p.id,
       'Is the battery replaceable?',
       'No, but it is rated for 1000+ charge cycles.'
from public.products p where p.name = 'Wireless Headphones'
on conflict do nothing;
