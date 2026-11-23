import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Escocia contra Inglaterra (alternando lados).
enfrentamiento('Escocia vs Inglaterra', Difficulty.Medium, Difficulty.Medium, [Faction.Escocia, Faction.Inglaterra]);
