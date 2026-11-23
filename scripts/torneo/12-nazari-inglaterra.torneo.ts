import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Reino Nazarí contra Inglaterra (alternando lados).
enfrentamiento('Reino Nazarí vs Inglaterra', Difficulty.Medium, Difficulty.Medium, [Faction.Nazari, Faction.Inglaterra]);
