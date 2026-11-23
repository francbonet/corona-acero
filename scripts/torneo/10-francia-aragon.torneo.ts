import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Francia contra la Corona de Aragón (alternando lados).
enfrentamiento('Francia vs Aragón', Difficulty.Medium, Difficulty.Medium, [Faction.Francia, Faction.Aragon]);
