import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Portugal contra Inglaterra (alternando lados).
enfrentamiento('Portugal vs Inglaterra', Difficulty.Medium, Difficulty.Medium, [Faction.Portugal, Faction.Inglaterra]);
