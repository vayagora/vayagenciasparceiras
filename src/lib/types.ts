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
  // Fechamento: a Vay confirmou que a expedição aconteceu; os créditos foram lançados no extrato
  finished_at?: string | null;
  finished_by_name?: string;
  created_at: string;
};

// Etapa do cliente (SPEC 2.0): vem da etapa do negócio no HubSpot.
// em_contato = cotação (Pré Cotação, Realizar Cotação); negociacao = demais etapas em aberto;
// fechado = Emissão Realizada; perdido = Negócio perdido.
export type StageId = "em_contato" | "negociacao" | "fechado" | "perdido";
// Etapa do negócio no HubSpot agrupada
export type StageKind = "won" | "open" | "lost";

// Trecho do roteiro. lat/lng vêm do aeroporto (HubSpot); sem eles, usa a lista de cidades.
export type Leg = { city: string; date: string; lat?: number; lng?: number };

// Passageiro do negócio (espelho das associações negócio → contato no HubSpot).
// O parceiro recebe os passageiros dos negócios da própria agência (RLS).
export type Passenger = {
  id: string;
  deal_id: string;
  hubspot_contact_id: string | null;
  name: string;
  email: string;
  phone: string;
  is_titular: boolean;
  // Rótulos "Comprador" e "Passageiro" do HubSpot: quem comprou e quem viaja
  is_buyer: boolean;
  is_passenger: boolean;
  first_seen_at: string;
  position: number;
};

export type Deal = {
  id: string;
  hubspot_id: string | null;
  seq: number;
  // Nome do negócio no HubSpot
  name: string;
  // Etapa no HubSpot (valor interno) e agrupada: ganho, em aberto ou perdido
  hs_stage: string;
  stage_kind: StageKind;
  // "Observações para parceiro" do negócio no HubSpot
  partner_note: string;
  // false = encontrado por destino e data, mas não sinalizado no HubSpot (só a Vay vê; não remunera)
  signaled: boolean;
  // Como está no HubSpot: origem do negócio e parceiro pela empresa associada (para indicar o que corrigir)
  hs_origem: string;
  hs_agency: string;
  // Detalhes do produto no HubSpot (trechos, hotel, seguro) para o modal
  details: DealDetails;
  // "Forma de pagamento do cliente" no HubSpot
  payment_methods: string[];
  // Cashback final definido pela Vay; null = calculado pelas regras
  cashback_override: number | null;
  afiliado: string;
  // Data de fechamento (só negócio ganho)
  closed_on: string | null;
  legs: Leg[];
  end_date: string;
  voo: number;
  hotel: number;
  seguro: number;
  override_expedition_id: string | null;
  override_none: boolean;
  reviewed: boolean;
  // Quem conferiu, quando e quais avisos (chaves) estavam na conferência
  reviewed_at?: string | null;
  reviewed_by_name?: string;
  reviewed_flags?: string[];
  // Total de passageiros
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

export type CashbackChange = {
  id: string;
  deal_id: string;
  old_value: number | null;
  new_value: number | null;
  calculated: number;
  note: string;
  changed_by_name: string;
  changed_at: string;
};

export type BalanceEntry = {
  id: string;
  partner_id: string;
  kind: "in" | "out";
  amount: number;
  // Fechamento de expedição (créditos liberados); null = lançamento manual antigo
  expedition_id?: string | null;
  entry_date: string;
  title: string;
  note: string;
  created_by_name: string;
  created_at: string;
};

// Conferência da Vay (SPEC 2.1): pessoa marcada como "Conferido" numa expedição. Não volta para "A conferir".
export type ExpeditionReview = {
  id: string;
  expedition_id: string;
  person_key: string;
  person_name: string;
  reviewed_by_name: string;
  reviewed_at: string;
};
