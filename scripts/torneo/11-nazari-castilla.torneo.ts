import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Reino Nazarí contra Castilla (alternando lados).
enfrentamiento('Reino Nazarí vs Castilla', Difficulty.Medium, Difficulty.Medium, [Faction.Nazari, Faction.Castilla]);
