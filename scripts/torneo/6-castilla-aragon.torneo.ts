import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Castilla contra la Corona de Aragón (alternando lados).
enfrentamiento('Castilla vs Aragón', Difficulty.Medium, Difficulty.Medium, [Faction.Castilla, Faction.Aragon]);
