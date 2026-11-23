import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Escocia contra Portugal (alternando lados).
enfrentamiento('Escocia vs Portugal', Difficulty.Medium, Difficulty.Medium, [Faction.Escocia, Faction.Portugal]);
