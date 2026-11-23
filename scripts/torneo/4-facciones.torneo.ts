import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Castilla contra Inglaterra (alternando lados): mide el equilibrio entre facciones.
enfrentamiento('Castilla vs Inglaterra', Difficulty.Medium, Difficulty.Medium, [Faction.Castilla, Faction.Inglaterra]);
