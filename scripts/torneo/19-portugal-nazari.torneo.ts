import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Portugal contra Reino Nazarí (alternando lados).
enfrentamiento('Portugal vs Reino Nazarí', Difficulty.Medium, Difficulty.Medium, [Faction.Portugal, Faction.Nazari]);
