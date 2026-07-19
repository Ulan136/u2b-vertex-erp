-- Реквизиты организации (одна строка id=1) + печать/подпись/логотип (base64).
CREATE TABLE IF NOT EXISTS org_settings (
  id            integer PRIMARY KEY DEFAULT 1,
  company_name  varchar(200),
  company_full  varchar(300),
  bin           varchar(20),
  address       text,
  phone         varchar(50),
  director_name varchar(150),
  banks         jsonb DEFAULT '[]'::jsonb,
  logo_b64      text,
  stamp_b64     text,
  sign_b64      text,
  updated_at    timestamptz DEFAULT now()
);
--> statement-breakpoint
-- Документы: счета на оплату / накладные З-2 / акты Р-1 / КП.
CREATE TABLE IF NOT EXISTS documents (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type             varchar(20) NOT NULL,
  number           integer NOT NULL,
  doc_no           varchar(50),
  doc_date         date DEFAULT CURRENT_DATE,
  buyer_name       varchar(250),
  buyer_bin        varchar(20),
  buyer_address    text,
  buyer_requisites text,
  bank             varchar(20),
  items            jsonb DEFAULT '[]'::jsonb,
  total            numeric(14,2) DEFAULT '0',
  amount_words     text,
  with_stamp       boolean DEFAULT false,
  with_sign        boolean DEFAULT false,
  comment          text,
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS documents_type_idx ON documents(type, number);
