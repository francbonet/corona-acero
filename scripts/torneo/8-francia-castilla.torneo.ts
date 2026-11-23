import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Francia contra Castilla (alternando lados).
enfrentamiento('Francia vs Castilla', Difficulty.Medium, Difficulty.Medium, [Faction.Francia, Faction.Castilla]);
