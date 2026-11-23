import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Escocia contra Castilla (alternando lados).
enfrentamiento('Escocia vs Castilla', Difficulty.Medium, Difficulty.Medium, [Faction.Escocia, Faction.Castilla]);
