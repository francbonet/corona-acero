import { Difficulty } from '../../src/ai/difficulty';
import { Faction } from '../../src/data/factions';
import { enfrentamiento } from './partida';

// Misma dificultad, Reino Nazarí contra la Corona de Aragón (alternando lados).
enfrentamiento('Reino Nazarí vs Aragón', Difficulty.Medium, Difficulty.Medium, [Faction.Nazari, Faction.Aragon]);
