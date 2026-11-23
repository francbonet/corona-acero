import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Escocia contra Francia (alternando lados).
enfrentamiento('Escocia vs Francia', Difficulty.Medium, Difficulty.Medium, [Faction.Escocia, Faction.Francia]);
