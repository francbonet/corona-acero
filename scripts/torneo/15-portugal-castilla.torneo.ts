import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Portugal contra Castilla (alternando lados).
enfrentamiento('Portugal vs Castilla', Difficulty.Medium, Difficulty.Medium, [Faction.Portugal, Faction.Castilla]);
