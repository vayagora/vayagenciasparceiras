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
  // Acordo próprio no Storage; null = acordo padrão
  agreement_path?: string | null;
  agreement_name?: string | null;
  created_at: string;
};

export type Expedition = {
  id: string;
  partner_id: string;
  name: string;
  city: string;
  start_date: string;
  days: number;
  // Aeroportos preferenciais (código IATA). O de chegada dá as coordenadas do destino para o vínculo.
  arrival_airport: string | null;
  departure_airport: string | null;
  created_at: string;
};

// Etapa exibida: vem do HubSpot (novo = não contactado · negociacao · fechado) ou da marcação manual da Vay.
export type StageId = "novo" | "negociacao" | "fechado" | "nao_contactar" | "outro_lugar";
// O que fica gravado em clients.stage: só a marcação manual.
export type ManualStage = "auto" | "nao_contactar" | "outro_lugar";

export type Client = {
  id: string;
  expedition_id: string;
  name: string;
  email: string;
  phone: string;
  stage: ManualStage;
  hubspot_status: "novo" | "existente" | null;
  hubspot_contact_id: string | null;
  // Calculado pela sincronização: negócio compatível com a expedição em aberto ou ganho
  hs_status: "negociacao" | "fechado" | null;
  hs_deal_id: string | null;
  // "Observações para parceiro" do contato no HubSpot
  partner_note: string;
  last_follow_up: string | null;
  note: string;
  created_at: string;
};

// Trecho do roteiro. lat/lng vêm do aeroporto (HubSpot); sem eles, usa a lista de cidades.
export type Leg = { city: string; date: string; lat?: number; lng?: number };

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
  // Nome do negócio no HubSpot
  name: string;
  // false = encontrado por destino e data, mas não sinalizado no HubSpot (só a Vay vê; não remunera)
  signaled: boolean;
  // Como está no HubSpot: origem do negócio e parceiro pela empresa associada (para indicar o que corrigir)
  hs_origem: string;
  hs_agency: string;
  // Detalhes do produto no HubSpot (trechos, hotel, seguro) para o modal
  details: DealDetails;
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

// ---------------------------------------------------------------- Detalhes do produto (HubSpot)

export type FlightSegment = {
  from: string;
  to: string;
  date: string;
  dep: string;
  arr: string;
  airline: string;
};
export type DealDetails = {
  voo?: { segments: FlightSegment[] };
  hotel?: { name: string; city: string; checkin: string; checkout: string; checkinTime: string; checkoutTime: string; room: string; board: string };
  seguro?: { plan: string; type: string; destination: string; start: string; end: string; coverage: string };
};

export type DealNote = {
  id: string;
  deal_id: string;
  product: "voo" | "hotel" | "seguro";
  body: string;
  file_path: string | null;
  file_name: string | null;
  created_by_name: string;
  created_at: string;
};

export type BalanceEntry = {
  id: string;
  partner_id: string;
  kind: "in" | "out";
  amount: number;
  entry_date: string;
  title: string;
  note: string;
  created_by_name: string;
  created_at: string;
};
