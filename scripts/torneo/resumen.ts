/// <reference types="node" />
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DIR_RESULTADOS, type Resultado } from './partida';

/** `globalSetup` del torneo: limpia los resultados anteriores y, al terminar, imprime el resumen. */
export default function setup(): () => void {
  rmSync(DIR_RESULTADOS, { recursive: true, force: true });
  return () => {
    let files: string[] = [];
    try {
      files = readdirSync(DIR_RESULTADOS).filter((f: string) => f.endsWith('.json')).sort();
    } catch {
      return;
    }
    const todos: Resultado[] = files.flatMap((f) => JSON.parse(readFileSync(join(DIR_RESULTADOS, f), 'utf8')) as Resultado[]);
    const pct = (n: number, d: number) => (d === 0 ? '—' : `${Math.round((100 * n) / d)} %`);
    const lineas: string[] = ['', '══ Torneo de Corona y Acero ══', ''];

    for (const r of todos) {
      const quien = r.ganador === 0 ? 'empate' : `gana ${r.rivales[r.ganador - 1]} (${r.facciones[r.ganador - 1]})`;
      const lado = (i: number) => `${r.rivales[i]} (${r.facciones[i]}, ${r.estrategias[i]})`.padEnd(40);
      lineas.push(`  ${r.semilla.padEnd(8)} ${lado(0)} vs ${lado(1)} → ${quien}, ${r.minutos} min [${r.segundos} s]`);
    }
    lineas.push('');

    lineas.push('Enfrentamiento            Partidas  Victorias de cada rival          Empates  Duración media');
    for (const f of files) {
      const rs = todos.filter((r) => `${r.enfrentamiento}.json` === f);
      if (rs.length === 0) continue;
      const nombres = [...new Set(rs.flatMap((r) => r.rivales))];
      const victorias = nombres.map((n) => `${n} ${pct(rs.filter((r) => r.ganador > 0 && r.rivales[r.ganador - 1] === n).length, rs.length)}`);
      const empates = rs.filter((r) => r.ganador === 0).length;
      const media = rs.reduce((s, r) => s + r.minutos, 0) / rs.length;
      lineas.push(
        `${rs[0].enfrentamiento.padEnd(26)}${String(rs.length).padEnd(10)}${victorias.join(' · ').padEnd(33)}${String(empates).padEnd(9)}${media.toFixed(1)} min`,
      );
    }

    // Facciones: solo cuentan las partidas entre rivales de la misma dificultad.
    const parejas = todos.filter((r) => r.rivales[0] === r.rivales[1] && r.facciones[0] !== r.facciones[1]);
    if (parejas.length > 0) {
      lineas.push('', 'Facciones (misma dificultad, facciones distintas)');
      for (const fac of [...new Set(parejas.flatMap((r) => r.facciones))].sort()) {
        const ganadas = parejas.filter((r) => r.ganador > 0 && r.facciones[r.ganador - 1] === fac).length;
        lineas.push(`  ${fac.padEnd(12)} ${pct(ganadas, parejas.length)} de ${parejas.length}`);
      }
    }
    lineas.push('');
    console.log(lineas.join('\n'));
  };
}
