-- Самообучающийся справочник типов приборов + алиасы.
CREATE TABLE IF NOT EXISTS device_types (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name varchar(200) NOT NULL,
  norm varchar(200) NOT NULL UNIQUE,
  usage_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS device_type_aliases (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  alias varchar(200) NOT NULL,
  norm varchar(200) NOT NULL,
  device_type_id uuid NOT NULL REFERENCES device_types(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS device_types_usage_idx ON device_types (usage_count DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS device_type_aliases_norm_idx ON device_type_aliases (norm);
