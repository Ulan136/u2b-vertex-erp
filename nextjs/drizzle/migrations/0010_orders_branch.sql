-- Филиал заявки (nullable). NULL = головной (Алматы).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);
--> statement-breakpoint
-- Признак головного филиала (Алматы): заявки без филиала считаются его.
ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_head boolean DEFAULT false;
