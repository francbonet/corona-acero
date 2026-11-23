import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Francia contra Inglaterra (alternando lados).
enfrentamiento('Francia vs Inglaterra', Difficulty.Medium, Difficulty.Medium, [Faction.Francia, Faction.Inglaterra]);
