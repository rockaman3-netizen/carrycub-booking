export type Vehicle = {
  id: string;
  name: string;
  size: string;
  capacity: string;
  image: string;
};

export const VEHICLES: Vehicle[] = [
  {
    id: "3-wheeler-tempo",
    name: "3 Wheeler Tempo",
    size: "Small loads",
    capacity: "Up to 500 kg",
    image: "/vehicles/3-wheeler.webp",
  },
  {
    id: "tata-ace-7ft",
    name: "Tata Ace 7 ft",
    size: "7 ft body",
    capacity: "Up to 750 kg",
    image: "/vehicles/tata-ace.webp",
  },
  {
    id: "9-ft-pickup",
    name: "9 ft Pickup",
    size: "9 ft body",
    capacity: "Up to 1.5 ton",
    image: "/vehicles/9ft-pickup.webp",
  },
  {
    id: "10-ft-pickup",
    name: "10 ft Pickup",
    size: "10 ft body",
    capacity: "Up to 2 ton",
    image: "/vehicles/10ft-pickup.webp",
  },
  {
    id: "14-ft-lpt",
    name: "14 ft LPT",
    size: "14 ft body · heavy loads",
    capacity: "Up to 6 ton",
    image: "/vehicles/14ft-lpt.webp",
  },
];

export const vehicleById = (id: string) => VEHICLES.find((v) => v.id === id);
