import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Escocia contra la Corona de Aragón (alternando lados).
enfrentamiento('Escocia vs Aragón', Difficulty.Medium, Difficulty.Medium, [Faction.Escocia, Faction.Aragon]);
