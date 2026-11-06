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
  hubspot_contact_id: string | null;
  last_follow_up: string | null;
  note: string;
  created_at: string;
};

export type Leg = { city: string; date: string };

// Passageiro do negócio (espelho das associações negócio → contato no HubSpot).
// O parceiro só recebe do banco os passageiros que ele cadastrou (RLS).
export type Passenger = {
  id: string;
  deal_id: string;
  hubspot_contact_id: string | null;
  name: string;
  email: string;
  phone: string;
  is_titular: boolean;
  first_seen_at: string;
  position: number;
};

export type Deal = {
  id: string;
  hubspot_id: string | null;
  seq: number;
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
  // Total de passageiros (o parceiro vê a contagem, não a identidade dos que não cadastrou)
  passenger_count: number;
  titular_labeled: boolean;
  // Passageiros visíveis para o usuário (carregados à parte)
  passengers: Passenger[];
};
