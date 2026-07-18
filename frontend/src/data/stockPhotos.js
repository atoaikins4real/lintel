// Curated, real, currently-live royalty-free property photos from Unsplash
// (free to use under the Unsplash License — https://unsplash.com/license).
// Used to let a unit's photo be picked from a gallery instead of pasting a raw URL.

const RAW = [
  {
    id: '1757970326337-95d7cca56fa1',
    label: 'Apartment block, balconies',
    credit: 'Sebastian Schuster',
    tags: ['apartment', 'standard', 'premium'],
  },
  {
    id: '1759845565036-cbecbcfcb8e2',
    label: 'Geometric apartment facade',
    credit: 'Joachim Lesne',
    tags: ['apartment', 'premium', 'luxury'],
  },
  {
    id: '1768638687896-35bde623d532',
    label: 'Apartment building, balconies',
    credit: 'Maximilian Bungart',
    tags: ['apartment', 'standard'],
  },
  {
    id: '1760473537243-72168ffd273c',
    label: 'Row of modern houses by a lake',
    credit: 'Roger Starnes Sr',
    tags: ['house', 'premium', 'luxury'],
  },
  {
    id: '1668911494509-14baf3b42fda',
    label: 'House with driveway',
    credit: 'Point3D Commercial Imaging',
    tags: ['house', 'townhouse', 'standard', 'premium'],
  },
  {
    id: '1517394282846-491ed4229ccd',
    label: 'Townhouse row, aerial',
    credit: 'Jack Finnigan',
    tags: ['townhouse', 'premium'],
  },
  {
    id: '1763827657709-b1bbc3c4945b',
    label: 'Cozy living room',
    credit: 'Clay Banks',
    tags: ['studio', 'apartment', 'standard'],
  },
  {
    id: '1754999809963-79a41e8fb648',
    label: 'Elegant living room',
    credit: 'Clay Banks',
    tags: ['studio', 'apartment', 'luxury', 'premium'],
  },
];

export const STOCK_PHOTOS = RAW.map((p) => ({
  ...p,
  thumb: `https://images.unsplash.com/photo-${p.id}?w=400&q=60&auto=format&fit=crop`,
  full: `https://images.unsplash.com/photo-${p.id}?w=1600&q=80&auto=format&fit=crop`,
}));

export function suggestedPhotos(unitType, unitClass) {
  const matches = STOCK_PHOTOS.filter((p) => p.tags.includes(unitType) || p.tags.includes(unitClass));
  return matches.length ? matches : STOCK_PHOTOS;
}
