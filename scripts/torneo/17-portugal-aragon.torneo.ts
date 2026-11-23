import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Portugal contra la Corona de Aragón (alternando lados).
enfrentamiento('Portugal vs Aragón', Difficulty.Medium, Difficulty.Medium, [Faction.Portugal, Faction.Aragon]);
