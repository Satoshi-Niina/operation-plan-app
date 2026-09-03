CREATE TABLE operation_plans (
  id TEXT PRIMARY KEY,
  tenant_slug TEXT NOT NULL,
  date DATE NOT NULL,
  office TEXT NOT NULL,
  model TEXT NOT NULL,
  machine_number TEXT NOT NULL,
  work TEXT NOT NULL,
  operator TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  departure_base TEXT NOT NULL,
  arrival_base TEXT NOT NULL,
  time_band TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX operation_plans_tenant_date_idx ON operation_plans (tenant_slug, date);

CREATE TABLE maintenance_offices (
  tenant_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (tenant_slug, name)
);

CREATE TABLE maintenance_bases (
  tenant_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (tenant_slug, name)
);

CREATE TABLE maintenance_vehicles (
  tenant_slug TEXT NOT NULL,
  machine_number TEXT NOT NULL,
  model TEXT NOT NULL,
  office TEXT NOT NULL,
  home_base TEXT NOT NULL,
  PRIMARY KEY (tenant_slug, machine_number)
);

CREATE TABLE vehicle_inspection_masters (
  tenant_slug TEXT NOT NULL,
  machine_number TEXT NOT NULL,
  model TEXT NOT NULL,
  category TEXT NOT NULL,
  inspection_base TEXT NOT NULL,
  PRIMARY KEY (tenant_slug, machine_number)
);

CREATE TABLE inspection_rules (
  category TEXT NOT NULL,
  inspection_type TEXT NOT NULL,
  phase_months INTEGER NOT NULL,
  interval_months INTEGER NOT NULL,
  inspection_days INTEGER NOT NULL,
  PRIMARY KEY (category, inspection_type)
);

CREATE TABLE inspection_actuals (
  id TEXT PRIMARY KEY,
  tenant_slug TEXT NOT NULL,
  machine_number TEXT NOT NULL,
  completed_date DATE NOT NULL,
  phase_months INTEGER NOT NULL
);

CREATE TABLE maintenance_office_bases (
  tenant_slug TEXT NOT NULL,
  office_name TEXT NOT NULL,
  base_name TEXT NOT NULL,
  PRIMARY KEY (tenant_slug, office_name, base_name),
  FOREIGN KEY (tenant_slug, office_name) REFERENCES maintenance_offices (tenant_slug, name),
  FOREIGN KEY (tenant_slug, base_name) REFERENCES maintenance_bases (tenant_slug, name)
);