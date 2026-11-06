// Destinos disponíveis para expedições e trechos de negócios.
// A chave (name) é o que fica gravado no banco; lat/lng servem para a regra de raio.
export type City = { name: string; label: string; lat: number; lng: number };

export const CITIES: City[] = [
  // Brasil
  { name: "São Paulo", label: "São Paulo, SP", lat: -23.5505, lng: -46.6333 },
  { name: "Rio de Janeiro", label: "Rio de Janeiro, RJ", lat: -22.9068, lng: -43.1729 },
  { name: "Belo Horizonte", label: "Belo Horizonte, MG", lat: -19.9167, lng: -43.9345 },
  { name: "Brasília", label: "Brasília, DF", lat: -15.7939, lng: -47.8828 },
  { name: "Salvador", label: "Salvador, BA", lat: -12.9777, lng: -38.5016 },
  { name: "Recife", label: "Recife, PE", lat: -8.0476, lng: -34.877 },
  { name: "Fortaleza", label: "Fortaleza, CE", lat: -3.7319, lng: -38.5267 },
  { name: "Natal", label: "Natal, RN", lat: -5.7945, lng: -35.211 },
  { name: "Maceió", label: "Maceió, AL", lat: -9.6658, lng: -35.735 },
  { name: "Porto Seguro", label: "Porto Seguro, BA", lat: -16.4497, lng: -39.0647 },
  { name: "Manaus", label: "Manaus, AM", lat: -3.119, lng: -60.0217 },
  { name: "Belém", label: "Belém, PA", lat: -1.4558, lng: -48.4902 },
  { name: "Curitiba", label: "Curitiba, PR", lat: -25.4284, lng: -49.2733 },
  { name: "Foz do Iguaçu", label: "Foz do Iguaçu, PR", lat: -25.5469, lng: -54.5882 },
  { name: "Florianópolis", label: "Florianópolis, SC", lat: -27.5954, lng: -48.548 },
  { name: "Porto Alegre", label: "Porto Alegre, RS", lat: -30.0346, lng: -51.2177 },
  { name: "Gramado", label: "Gramado, RS", lat: -29.3746, lng: -50.8764 },
  { name: "Bonito", label: "Bonito, MS", lat: -21.1261, lng: -56.4836 },
  // América do Sul
  { name: "Buenos Aires", label: "Buenos Aires, Argentina", lat: -34.6037, lng: -58.3816 },
  { name: "Mendoza", label: "Mendoza, Argentina", lat: -32.8895, lng: -68.8458 },
  { name: "Bariloche", label: "Bariloche, Argentina", lat: -41.1335, lng: -71.3103 },
  { name: "Santiago", label: "Santiago, Chile", lat: -33.4489, lng: -70.6693 },
  { name: "Montevidéu", label: "Montevidéu, Uruguai", lat: -34.9011, lng: -56.1645 },
  { name: "Punta del Este", label: "Punta del Este, Uruguai", lat: -34.9667, lng: -54.95 },
  { name: "Lima", label: "Lima, Peru", lat: -12.0464, lng: -77.0428 },
  { name: "Cusco", label: "Cusco, Peru", lat: -13.532, lng: -71.9675 },
  { name: "Bogotá", label: "Bogotá, Colômbia", lat: 4.711, lng: -74.0721 },
  { name: "Cartagena", label: "Cartagena, Colômbia", lat: 10.391, lng: -75.4794 },
  // América do Norte e Caribe
  { name: "Cancún", label: "Cancún, México", lat: 21.1619, lng: -86.8515 },
  { name: "Cidade do México", label: "Cidade do México, México", lat: 19.4326, lng: -99.1332 },
  { name: "Punta Cana", label: "Punta Cana, Rep. Dominicana", lat: 18.582, lng: -68.4055 },
  { name: "Miami", label: "Miami, EUA", lat: 25.7617, lng: -80.1918 },
  { name: "Orlando", label: "Orlando, EUA", lat: 28.5383, lng: -81.3792 },
  { name: "Nova York", label: "Nova York, EUA", lat: 40.7128, lng: -74.006 },
  { name: "Las Vegas", label: "Las Vegas, EUA", lat: 36.1699, lng: -115.1398 },
  { name: "Los Angeles", label: "Los Angeles, EUA", lat: 34.0522, lng: -118.2437 },
  { name: "Chicago", label: "Chicago, EUA", lat: 41.8781, lng: -87.6298 },
  { name: "Toronto", label: "Toronto, Canadá", lat: 43.6532, lng: -79.3832 },
  // Europa
  { name: "Lisboa", label: "Lisboa, Portugal", lat: 38.7223, lng: -9.1393 },
  { name: "Porto", label: "Porto, Portugal", lat: 41.1579, lng: -8.6291 },
  { name: "Madrid", label: "Madrid, Espanha", lat: 40.4168, lng: -3.7038 },
  { name: "Barcelona", label: "Barcelona, Espanha", lat: 41.3874, lng: 2.1686 },
  { name: "Paris", label: "Paris, França", lat: 48.8566, lng: 2.3522 },
  { name: "Londres", label: "Londres, Reino Unido", lat: 51.5074, lng: -0.1278 },
  { name: "Roma", label: "Roma, Itália", lat: 41.9028, lng: 12.4964 },
  { name: "Milão", label: "Milão, Itália", lat: 45.4642, lng: 9.19 },
  { name: "Berlim", label: "Berlim, Alemanha", lat: 52.52, lng: 13.405 },
  { name: "Munique", label: "Munique, Alemanha", lat: 48.1351, lng: 11.582 },
  { name: "Frankfurt", label: "Frankfurt, Alemanha", lat: 50.1109, lng: 8.6821 },
  { name: "Amsterdã", label: "Amsterdã, Holanda", lat: 52.3676, lng: 4.9041 },
  { name: "Viena", label: "Viena, Áustria", lat: 48.2082, lng: 16.3738 },
  { name: "Zurique", label: "Zurique, Suíça", lat: 47.3769, lng: 8.5417 },
  { name: "Atenas", label: "Atenas, Grécia", lat: 37.9838, lng: 23.7275 },
  { name: "Istambul", label: "Istambul, Turquia", lat: 41.0082, lng: 28.9784 },
  // Oriente Médio, África, Ásia e Oceania
  { name: "Dubai", label: "Dubai, Emirados Árabes", lat: 25.2048, lng: 55.2708 },
  { name: "Cairo", label: "Cairo, Egito", lat: 30.0444, lng: 31.2357 },
  { name: "Cidade do Cabo", label: "Cidade do Cabo, África do Sul", lat: -33.9249, lng: 18.4241 },
  { name: "Tóquio", label: "Tóquio, Japão", lat: 35.6762, lng: 139.6503 },
  { name: "Xangai", label: "Xangai, China", lat: 31.2304, lng: 121.4737 },
  { name: "Singapura", label: "Singapura", lat: 1.3521, lng: 103.8198 },
  { name: "Bangkok", label: "Bangkok, Tailândia", lat: 13.7563, lng: 100.5018 },
  { name: "Sydney", label: "Sydney, Austrália", lat: -33.8688, lng: 151.2093 },
];

const BY_NAME = new Map(CITIES.map((c) => [c.name, c]));

export function cityOf(name: string): City | undefined {
  return BY_NAME.get(name);
}

export function cityLabel(name: string): string {
  return BY_NAME.get(name)?.label ?? name;
}

export function kmBetween(a: Pick<City, "lat" | "lng">, b: Pick<City, "lat" | "lng">): number {
  const R = 6371;
  const toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR;
  const dLng = (b.lng - a.lng) * toR;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Cidade da lista mais próxima de um ponto, até maxKm (ex.: aeroporto GRU → São Paulo).
export function nearestCity(lat: number, lng: number, maxKm = 60): City | undefined {
  let best: { c: City; km: number } | undefined;
  for (const c of CITIES) {
    const km = kmBetween({ lat, lng }, c);
    if (km <= maxKm && (!best || km < best.km)) best = { c, km };
  }
  return best?.c;
}
