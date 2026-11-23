import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Lo mismo en difícil: el equilibrio entre facciones no debería depender del nivel.
enfrentamiento('Castilla vs Inglaterra (difícil)', Difficulty.Hard, Difficulty.Hard, [Faction.Castilla, Faction.Inglaterra]);
