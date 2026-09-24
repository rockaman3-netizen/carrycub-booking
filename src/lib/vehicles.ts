export type Vehicle = {
  id: string;
  name: string;
  size: string;
  capacity: string;
  image: string;
  baseFare: number; // covers first `baseKm` kilometers
  baseKm: number;
  perKm: number; // rate per km beyond baseKm
};

export const VEHICLES: Vehicle[] = [
  {
    id: "3-wheeler-tempo",
    name: "3 Wheeler Tempo",
    size: "Small loads",
    capacity: "Up to 500 kg",
    image: "/vehicles/3-wheeler.webp",
    baseFare: 290,
    baseKm: 5,
    perKm: 106,
  },
  {
    id: "tata-ace-7ft",
    name: "Tata Ace 7 ft",
    size: "7 ft body",
    capacity: "Up to 750 kg",
    image: "/vehicles/tata-ace.webp",
    baseFare: 390,
    baseKm: 5,
    perKm: 139,
  },
  {
    id: "9-ft-pickup",
    name: "9 ft Pickup",
    size: "9 ft body",
    capacity: "Up to 1.5 ton",
    image: "/vehicles/9ft-pickup.webp",
    baseFare: 450,
    baseKm: 5,
    perKm: 187,
  },
  {
    id: "10-ft-pickup",
    name: "10 ft Pickup",
    size: "10 ft body",
    capacity: "Up to 2 ton",
    image: "/vehicles/10ft-pickup.webp",
    baseFare: 480,
    baseKm: 5,
    perKm: 168,
  },
  {
    id: "14-ft-lpt",
    name: "14 ft LPT",
    size: "14 ft body · heavy loads",
    capacity: "Up to 6 ton",
    image: "/vehicles/14ft-lpt.webp",
    baseFare: 570,
    baseKm: 5,
    perKm: 223,
  },
];

export const vehicleById = (id: string) => VEHICLES.find((v) => v.id === id);

// Base fare covers the first `baseKm` kilometers; every km beyond that
// is charged at `perKm`. Result is rounded to the nearest rupee.
export function estimateFare(vehicleId: string, distanceKm: number): number | null {
  const vehicle = vehicleById(vehicleId);
  if (!vehicle) return null;
  const extraKm = Math.max(0, distanceKm - vehicle.baseKm);
  const fare = vehicle.baseFare + extraKm * vehicle.perKm;
  return Math.round(fare);
}
