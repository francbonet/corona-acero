import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Inglaterra contra la Corona de Aragón (alternando lados).
enfrentamiento('Inglaterra vs Aragón', Difficulty.Medium, Difficulty.Medium, [Faction.Inglaterra, Faction.Aragon]);
