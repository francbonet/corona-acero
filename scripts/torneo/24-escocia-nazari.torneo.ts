import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Escocia contra Reino Nazarí (alternando lados).
enfrentamiento('Escocia vs Reino Nazarí', Difficulty.Medium, Difficulty.Medium, [Faction.Escocia, Faction.Nazari]);
