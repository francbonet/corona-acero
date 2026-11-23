import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Portugal contra Francia (alternando lados).
enfrentamiento('Portugal vs Francia', Difficulty.Medium, Difficulty.Medium, [Faction.Portugal, Faction.Francia]);
