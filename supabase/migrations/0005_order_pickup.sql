-- Order pickup at the Express counter: who is taking an online order to
-- the counter and when it was packed, so two people don't pack the same
-- order and the customer can be told it's ready. Collection itself keeps
-- using popup_orders.status = 'collected' and collected_at.

alter table popup_orders
  add column if not exists pickup_handler text,
  add column if not exists pickup_taken_at timestamptz,
  add column if not exists packed_at timestamptz;
