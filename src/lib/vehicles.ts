export type Vehicle = {
  id: string;
  name: string;
  size: string;
  emoji: string;
};

export const VEHICLES: Vehicle[] = [
  { id: "3-wheeler-tempo", name: "3 Wheeler Tempo", size: "Small loads", emoji: "🛺" },
  { id: "tata-ace-7ft", name: "Tata Ace 7 ft", size: "7 ft body", emoji: "🛻" },
  { id: "9-ft-pickup", name: "9 ft Pickup", size: "9 ft body", emoji: "🛻" },
  { id: "10-ft-pickup", name: "10 ft Pickup", size: "10 ft body", emoji: "🛻" },
  { id: "14-ft-lpt", name: "14 ft LPT", size: "14 ft body · heavy loads", emoji: "🚛" },
];

export const vehicleById = (id: string) => VEHICLES.find((v) => v.id === id);
