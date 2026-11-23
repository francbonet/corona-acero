import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Reino Nazarí contra Francia (alternando lados).
enfrentamiento('Reino Nazarí vs Francia', Difficulty.Medium, Difficulty.Medium, [Faction.Nazari, Faction.Francia]);
