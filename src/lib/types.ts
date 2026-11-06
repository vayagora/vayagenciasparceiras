export type Role = "vay" | "parceiro";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  partner_id: string | null;
};

export type Partner = {
  id: string;
  name: string;
  afiliado: string;
  contact_email: string | null;
  created_at: string;
};

export type Expedition = {
  id: string;
  partner_id: string;
  name: string;
  city: string;
  start_date: string;
  days: number;
  created_at: string;
};

export type StageId = "novo" | "contato" | "proposta" | "fechado" | "desistiu";

export type Client = {
  id: string;
  expedition_id: string;
  name: string;
  email: string;
  phone: string;
  stage: StageId;
  hubspot_status: "novo" | "existente" | null;
  last_follow_up: string | null;
  note: string;
  created_at: string;
};

export type Leg = { city: string; date: string };

export type Deal = {
  id: string;
  hubspot_id: string | null;
  contact_name: string;
  email: string;
  afiliado: string;
  closed_on: string;
  legs: Leg[];
  end_date: string;
  voo: number;
  hotel: number;
  seguro: number;
  override_expedition_id: string | null;
  override_none: boolean;
  reviewed: boolean;
};
