export const ACTIVITY_CATEGORIES = [
  { id: 'INT-1', label: 'Italian Cuisine', type: 'CUISINE', multiplier: 1.0, icon: 'pizza', title: 'Italian Cuisine' },
  { id: 'INT-2', label: 'Museums', type: 'ACTIVITY', multiplier: 1.2, icon: 'bank', title: 'Museums' },
  { id: 'INT-3', label: 'Cafe Hopping', type: 'ACTIVITY', multiplier: 1.0, icon: 'coffee', title: 'Cafe Hopping' },
  { id: 'INT-4', label: 'Movies', type: 'ACTIVITY', multiplier: 1.0, icon: 'popcorn', title: 'Movies' },
  { id: 'INT-5', label: 'Concerts', type: 'ACTIVITY', multiplier: 1.5, icon: 'ticket-confirmation', title: 'Concerts' },
  { id: 'INT-6', label: 'Parks', type: 'ACTIVITY', multiplier: 1.0, icon: 'tree', title: 'Parks' },
  { id: 'INT-7', label: 'Sightseeing', type: 'ACTIVITY', multiplier: 1.2, icon: 'camera', title: 'Sightseeing' },
  { id: 'INT-8', label: 'Clubbing', type: 'ACTIVITY', multiplier: 1.5, icon: 'glass-cocktail', title: 'Clubbing' },
  { id: 'INT-9', label: 'Art Galleries', type: 'ACTIVITY', multiplier: 1.2, icon: 'palette', title: 'Art Galleries' },
  { id: 'INT-10', label: 'Hiking', type: 'ACTIVITY', multiplier: 1.5, icon: 'hiking', title: 'Hiking' },
  { id: 'INT-11', label: 'Board Games', type: 'ACTIVITY', multiplier: 1.0, icon: 'dice-multiple', title: 'Board Games' },
  { id: 'INT-12', label: 'Karaoke', type: 'ACTIVITY', multiplier: 1.2, icon: 'microphone', title: 'Karaoke' },
  { id: 'INT-13', label: 'Gaming', type: 'ACTIVITY', multiplier: 1.0, icon: 'controller-classic', title: 'Gaming' },
] as const;

export const ACTIVITY_MULTIPLIERS: Record<string, number> = Object.fromEntries(
  ACTIVITY_CATEGORIES.map(({ id, multiplier }) => [id, multiplier]),
);
