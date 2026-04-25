import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../services/data.service';
import { VersionService } from '../services/version.service';
import { WorkflowService } from '../services/workflow.service';
import { ScenarioService, ScenarioRunSummary, ScenarioId } from '../services/scenario.service';
import { Paciente, RegistroNutricional, FlujoAsignado } from '../models/nutricion.models';

interface PairGroup {
  id: string;
  label: string;
  s1id: string;
  s2id: string;
  s1: ScenarioRunSummary | null;
  s2: ScenarioRunSummary | null;
  delta: { tiempo: number; clicks: number; facilidad: number } | null;
}

@Component({
  selector: 'app-analisis',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './analisis.component.html',
  styleUrl: './analisis.component.scss'
})
export class AnalisisComponent implements OnInit {
  isAIEnabled = false;
  pacientes: Paciente[] = [];
  registros: RegistroNutricional[] = [];
  flujosAsignados: FlujoAsignado[] = [];
  scenarioSummaries: ScenarioRunSummary[] = [];
  pairGroups: PairGroup[] = [];

  estadisticas = {
    totalPacientes: 0,
    pacientesActivos: 0,
    totalConsultas: 0,
    consultasConIA: 0,
    consultasSinIA: 0,
    promedioIMC: 0
  };
  metricasFlujo = {
    sinIA: { total: 0, tiempoPromedio: 0, facilidadPromedio: 0, interaccionesPromedio: 0, manualesPromedio: 0 },
    conIA: { total: 0, tiempoPromedio: 0, facilidadPromedio: 0, interaccionesPromedio: 0, manualesPromedio: 0 },
    deltaTiempo: 0,
    deltaFacilidad: 0,
    deltaInteracciones: 0,
    deltaManuales: 0
  };

  constructor(
    private dataService: DataService,
    private versionService: VersionService,
    private workflowService: WorkflowService,
    private scenarioService: ScenarioService
  ) {}

  ngOnInit() {
    this.versionService.version$.subscribe(version => {
      this.isAIEnabled = this.versionService.isAIEnabled();
    });

    this.dataService.pacientes$.subscribe(pacientes => {
      this.pacientes = pacientes;
      this.calcularEstadisticas();
    });

    this.dataService.registros$.subscribe(registros => {
      this.registros = registros;
      this.calcularEstadisticas();
    });

    this.workflowService.asignaciones$.subscribe(asignaciones => {
      this.flujosAsignados = asignaciones;
      this.calcularMetricasFlujo();
    });

    this.scenarioService.scenarioSummaries$.subscribe(records => {
      this.scenarioSummaries = Object.values(records).filter((s): s is ScenarioRunSummary => !!s);
      this.buildPairGroups();
    });
  }

  get studyComplete(): boolean {
    return this.pairGroups.every(g => g.s1 && g.s2);
  }

  get completedCount(): number {
    return this.scenarioSummaries.length;
  }

  private buildPairGroups(): void {
    const scenarios = this.scenarioService.getScenarios();
    const getSummary = (id: string) => this.scenarioSummaries.find(s => s.scenarioId === id) ?? null;

    const makePair = (s1id: string, s2id: string): PairGroup => {
      const s1 = getSummary(s1id);
      const s2 = getSummary(s2id);
      const label = scenarios.find(s => s.id === s1id)?.patientName ?? s1id;
      let delta: PairGroup['delta'] = null;
      if (s1 && s2) {
        delta = {
          tiempo: (s1.tiempoTotalMin ?? 0) - (s2.tiempoTotalMin ?? 0),
          clicks: (s1.interaccionesTotal ?? 0) - (s2.interaccionesTotal ?? 0),
          facilidad: (s2.facilidadPromedio ?? 0) - (s1.facilidadPromedio ?? 0)
        };
      }
      return { id: s1id.charAt(0), label, s1id, s2id, s1, s2, delta };
    };

    this.pairGroups = [
      makePair('A1', 'A2'),
      makePair('B1', 'B2')
    ];
  }

  calcularEstadisticas() {
    this.estadisticas = {
      totalPacientes: this.pacientes.length,
      pacientesActivos: this.pacientes.filter(p => p.activo).length,
      totalConsultas: this.registros.length,
      consultasConIA: this.registros.filter(r => r.createdWith === 'con-ia').length,
      consultasSinIA: this.registros.filter(r => r.createdWith === 'sin-ia').length,
      promedioIMC: this.registros.length > 0 
        ? this.registros.reduce((sum, r) => sum + (r.peso / ((r.altura/100) * (r.altura/100))), 0) / this.registros.length
        : 0
    };
  }

  getObjetivosMasComunes() {
    const objetivos = this.registros.map(r => r.objetivo);
    const contador = objetivos.reduce((acc, obj) => {
      acc[obj] = (acc[obj] || 0) + 1;
      return acc;
    }, {} as any);
    
    return Object.entries(contador)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 3);
  }

  getPacientesMasActivos() {
    const pacientesConConsultas = this.pacientes.map(p => ({
      ...p,
      totalConsultas: this.registros.filter(r => r.pacienteId === p.id).length
    })).filter(p => p.totalConsultas > 0)
      .sort((a, b) => b.totalConsultas - a.totalConsultas)
      .slice(0, 5);
    
    return pacientesConConsultas;
  }

  getNombreFlujo(flujoId: string): string {
    return this.workflowService.getFlujoById(flujoId)?.nombre ?? flujoId;
  }

  get sortedSummaries(): ScenarioRunSummary[] {
    return [...this.scenarioSummaries].sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
  }

  get maxTiempo(): number {
    return Math.max(...this.scenarioSummaries.map(s => s.tiempoTotalMin ?? 0), 1);
  }

  get maxClicks(): number {
    return Math.max(...this.scenarioSummaries.map(s => s.interaccionesTotal ?? 0), 1);
  }

  get maxAutocomp(): number {
    return Math.max(...this.scenarioSummaries.map(s => s.camposAutocompletados ?? 0), 1);
  }

  getBarPct(value: number | undefined, max: number): number {
    if (!value || max <= 0) return 0;
    return Math.round(Math.min((value / max) * 100, 100));
  }

  // ── Exportador ────────────────────────────────────────────────────────

  exportJSON(): void {
    const payload = {
      exportedAt: new Date().toISOString(),
      scenarios: this.sortedSummaries.map(s => ({
        ...s,
        visitComments: this.getVisitComments(s.scenarioId)
      })),
      pairDeltas: this.pairGroups.map(g => ({
        pair: g.id,
        patient: g.label,
        estandar: g.s1 ? { id: g.s1id, tiempoTotalMin: g.s1.tiempoTotalMin, interaccionesTotal: g.s1.interaccionesTotal, facilidadPromedio: g.s1.facilidadPromedio } : null,
        asistida: g.s2 ? { id: g.s2id, tiempoTotalMin: g.s2.tiempoTotalMin, interaccionesTotal: g.s2.interaccionesTotal, facilidadPromedio: g.s2.facilidadPromedio } : null,
        delta: g.delta
      })),
      sus: this.susResult
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    this._downloadBlob(blob, `resultados-ab-${this._dateTag()}.json`);
  }

  exportCSV(): void {
    const headers = [
      'scenarioId', 'mode', 'patientName',
      'tiempoTotalMin', 'tiempoPromedioMin',
      'facilidadPromedio', 'interaccionesTotal', 'clicksPromedio',
      'camposAutocompletados', 'camposManuales',
      'stepsCompleted', 'totalSteps', 'ejecucionesCompletadas', 'finishedAt',
      'comentarios'
    ];
    const rows = this.sortedSummaries.map(s => {
      const comments = this.getVisitComments(s.scenarioId)
        .map(c => c.comentario.replace(/,/g, ';'))
        .join(' | ');
      return [
        s.scenarioId, s.mode, s.patientName,
        s.tiempoTotalMin ?? '', s.tiempoPromedioMin ?? '',
        s.facilidadPromedio ?? '', s.interaccionesTotal ?? '', s.clicksPromedio ?? '',
        s.camposAutocompletados ?? '', s.camposManuales ?? '',
        s.stepsCompleted, s.totalSteps, s.ejecucionesCompletadas, s.finishedAt,
        `"${comments}"`
      ];
    });
    const sus = this.susResult;
    const susRow = sus ? ['SUS', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', sus.completedAt, `"Score: ${sus.score} (${sus.label})"`] : null;
    const allRows = susRow ? [...rows, susRow] : rows;
    const csv = [headers, ...allRows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    this._downloadBlob(blob, `resultados-ab-${this._dateTag()}.csv`);
  }

  private _downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private _dateTag(): string {
    return new Date().toISOString().slice(0, 10);
  }

  get susResult(): { answers: number[]; score: number; label: string; completedAt: string } | null {
    try {
      const raw = localStorage.getItem('sus_results');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  readonly susQuestionTexts = [
    'Creo que me gustaría usar este sistema con frecuencia.',
    'Encontré el sistema innecesariamente complejo.',
    'Pensé que el sistema era fácil de usar.',
    'Creo que necesitaría el apoyo de un técnico para poder usar este sistema.',
    'Encontré que las diversas funciones del sistema estaban bien integradas.',
    'Pensé que había demasiada inconsistencia en este sistema.',
    'Imagino que la mayoría de las personas aprendería a usar este sistema muy rápidamente.',
    'Encontré el sistema muy incómodo de usar.',
    'Me sentí muy seguro/a usando el sistema.',
    'Necesité aprender muchas cosas antes de poder empezar a usar este sistema.'
  ];

  private getSusQuestionText(index: number): string {
    const questions = [
      'Creo que me gustaría usar este sistema con frecuencia.',
      'Encontré el sistema innecesariamente complejo.',
      'Pensé que el sistema era fácil de usar.',
      'Creo que necesitaría el apoyo de un técnico para poder usar este sistema.',
      'Encontré que las diversas funciones del sistema estaban bien integradas.',
      'Pensé que había demasiada inconsistencia en este sistema.',
      'Imagino que la mayoría de las personas aprendería a usar este sistema muy rápidamente.',
      'Encontré el sistema muy incómodo de usar.',
      'Me sentí muy seguro/a usando el sistema.',
      'Necesité aprender muchas cosas antes de poder empezar a usar este sistema.'
    ];
    return questions[index] ?? '';
  }

  private getVisitComments(scenarioId: string): { pasoId: string; comentario: string }[] {
    const scenario = this.scenarioService.getScenario(scenarioId as ScenarioId);
    if (!scenario) return [];
    const asignacion = this.flujosAsignados.find(
      a => a.pacienteId === scenario.patientId && a.flujoId === scenario.flujoId && a.estado === 'completado'
    );
    if (!asignacion) return [];
    return asignacion.ejecucion
      .filter(e => e.comentarios?.trim())
      .map(e => ({ pasoId: e.pasoId, comentario: e.comentarios! }));
  }

  printReport(): void {
    const sus = this.susResult;
    const date = new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });
    const scenarioRows = this.sortedSummaries.map(s => `
      <tr>
        <td>${s.scenarioId}</td><td>${s.patientName}</td>
        <td>${s.mode === 'con-ia' ? 'Asistida' : 'Estándar'}</td>
        <td>${s.tiempoTotalMin != null ? s.tiempoTotalMin.toFixed(1) + ' min' : '—'}</td>
        <td>${s.interaccionesTotal ?? '—'}</td>
        <td>${s.facilidadPromedio != null ? s.facilidadPromedio.toFixed(1) + '/5' : '—'}</td>
        <td>${(s.camposAutocompletados ?? 0)} / ${(s.camposManuales ?? 0)}</td>
      </tr>`).join('');
    const deltaRows = this.pairGroups.map(g => `
      <tr>
        <td>${g.label}</td>
        <td>${g.s1 ? (g.s1.tiempoTotalMin?.toFixed(1) ?? '—') + ' min' : '—'}</td>
        <td>${g.s2 ? (g.s2.tiempoTotalMin?.toFixed(1) ?? '—') + ' min' : '—'}</td>
        <td>${g.delta ? (g.delta.tiempo > 0 ? '−' : '+') + Math.abs(g.delta.tiempo).toFixed(1) + ' min' : '—'}</td>
        <td>${g.s1 ? (g.s1.facilidadPromedio?.toFixed(1) ?? '—') : '—'}</td>
        <td>${g.s2 ? (g.s2.facilidadPromedio?.toFixed(1) ?? '—') : '—'}</td>
        <td>${g.delta ? (g.delta.facilidad >= 0 ? '+' : '') + g.delta.facilidad.toFixed(1) + ' pts' : '—'}</td>
      </tr>`).join('');
    const susHtml = sus ? `
      <section>
        <h2>Cuestionario de Usabilidad (SUS)</h2>
        <p><strong>Puntuación:</strong> ${sus.score.toFixed(1)} — <em>${sus.label}</em></p>
        <p><strong>Completado:</strong> ${new Date(sus.completedAt).toLocaleString('es-CL')}</p>
        <table>
          <thead><tr><th>#</th><th>Pregunta</th><th>Respuesta (1-5)</th></tr></thead>
          <tbody>${sus.answers.map((a: number, i: number) => `<tr><td>${i + 1}</td><td>${this.getSusQuestionText(i)}</td><td>${a}</td></tr>`).join('')}</tbody>
        </table>
      </section>` : '<p><em>Cuestionario SUS no completado.</em></p>';
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
      <title>Informe de Resultados — Sistema Nutricional</title>
      <style>body{font-family:Arial,sans-serif;padding:2rem;color:#0f172a}h1{color:#1d4ed8;border-bottom:2px solid #1d4ed8;padding-bottom:.5rem}h2{color:#1e293b;margin-top:2rem;border-bottom:1px solid #e2e8f0;padding-bottom:.3rem}table{width:100%;border-collapse:collapse;margin-top:1rem}th{background:#1e3a8a;color:white;padding:.5rem .75rem;text-align:left;font-size:.85rem}td{padding:.45rem .75rem;border-bottom:1px solid #e2e8f0;font-size:.85rem}tr:nth-child(even) td{background:#f8fafc}.meta{color:#64748b;font-size:.9rem;margin-bottom:2rem}</style>
      </head><body>
      <h1>Informe de Resultados — Estudio Comparativo</h1>
      <p class="meta">Generado el ${date}</p>
      <section><h2>Resumen por sesión</h2>
      <table><thead><tr><th>ID</th><th>Paciente</th><th>Modalidad</th><th>Tiempo</th><th>Interacciones</th><th>Facilidad</th><th>Auto/Manual</th></tr></thead>
      <tbody>${scenarioRows}</tbody></table></section>
      <section><h2>Comparativa por par (Δ Asistida vs Estándar)</h2>
      <table><thead><tr><th>Paciente</th><th>Tiempo Est.</th><th>Tiempo Asist.</th><th>Δ Tiempo</th><th>Facilidad Est.</th><th>Facilidad Asist.</th><th>Δ Facilidad</th></tr></thead>
      <tbody>${deltaRows}</tbody></table></section>
      ${susHtml}
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  }

  // ── Resumen post-experimento ──────────────────────────────────────────

  get studySummaryRows(): { label: string; sinIA: string; conIA: string; delta: string; positive: boolean }[] {
    if (!this.studyComplete) return [];
    const pairs = this.pairGroups;
    const avg = (vals: (number | undefined)[]) => {
      const filtered = vals.filter((v): v is number => v !== undefined);
      return filtered.length ? filtered.reduce((a, b) => a + b, 0) / filtered.length : 0;
    };
    const sinIA = pairs.map(g => g.s1!);
    const conIA = pairs.map(g => g.s2!);

    const tSin = avg(sinIA.map(s => s.tiempoTotalMin));
    const tCon = avg(conIA.map(s => s.tiempoTotalMin));
    const cSin = avg(sinIA.map(s => s.interaccionesTotal));
    const cCon = avg(conIA.map(s => s.interaccionesTotal));
    const fSin = avg(sinIA.map(s => s.facilidadPromedio));
    const fCon = avg(conIA.map(s => s.facilidadPromedio));
    const mSin = avg(sinIA.map(s => s.camposManuales));
    const mCon = avg(conIA.map(s => s.camposManuales));

    return [
      {
        label: 'Tiempo promedio (min)',
        sinIA: tSin.toFixed(1), conIA: tCon.toFixed(1),
        delta: tSin > tCon ? `−${(tSin - tCon).toFixed(1)} min` : `+${(tCon - tSin).toFixed(1)} min`,
        positive: tSin > tCon
      },
      {
        label: 'Interacciones promedio',
        sinIA: cSin.toFixed(0), conIA: cCon.toFixed(0),
        delta: cSin > cCon ? `−${(cSin - cCon).toFixed(0)}` : `+${(cCon - cSin).toFixed(0)}`,
        positive: cSin > cCon
      },
      {
        label: 'Facilidad percibida (1-5)',
        sinIA: fSin.toFixed(1), conIA: fCon.toFixed(1),
        delta: fCon > fSin ? `+${(fCon - fSin).toFixed(1)} pts` : `−${(fSin - fCon).toFixed(1)} pts`,
        positive: fCon > fSin
      },
      {
        label: 'Campos manuales promedio',
        sinIA: mSin.toFixed(0), conIA: mCon.toFixed(0),
        delta: mSin > mCon ? `−${(mSin - mCon).toFixed(0)} campos` : `+${(mCon - mSin).toFixed(0)} campos`,
        positive: mSin > mCon
      }
    ];
  }

  private calcularMetricasFlujo() {
    const completados = this.flujosAsignados.filter(f => f.estado === 'completado' && f.resultado);

    const construirMetricas = (modo: 'sin-ia' | 'con-ia') => {
      const subset = completados.filter(f => f.modoEjecutado === modo);
      const total = subset.length;
      const tiempoPromedio = total > 0
        ? subset.reduce((sum, f) => sum + (f.resultado?.tiempoTotalMin || 0), 0) / total
        : 0;
      const facilidadPromedio = total > 0
        ? subset.reduce((sum, f) => sum + (f.resultado?.facilidadPromedio || 0), 0) / total
        : 0;
      const interaccionesPromedio = total > 0
        ? subset.reduce((sum, f) => sum + (f.resultado?.interaccionesTotal || 0), 0) / total
        : 0;
      const manualesPromedio = total > 0
        ? subset.reduce((sum, f) => sum + (f.resultado?.camposManualesTotal || 0), 0) / total
        : 0;
      return { total, tiempoPromedio, facilidadPromedio, interaccionesPromedio, manualesPromedio };
    };

    const sinIA = construirMetricas('sin-ia');
    const conIA = construirMetricas('con-ia');
    const deltaTiempo = sinIA.total > 0 && conIA.total > 0
      ? sinIA.tiempoPromedio - conIA.tiempoPromedio
      : 0;
    const deltaFacilidad = sinIA.total > 0 && conIA.total > 0
      ? conIA.facilidadPromedio - sinIA.facilidadPromedio
      : 0;
    const deltaInteracciones = sinIA.total > 0 && conIA.total > 0
      ? sinIA.interaccionesPromedio - conIA.interaccionesPromedio
      : 0;
    const deltaManuales = sinIA.total > 0 && conIA.total > 0
      ? sinIA.manualesPromedio - conIA.manualesPromedio
      : 0;

    this.metricasFlujo = {
      sinIA,
      conIA,
      deltaTiempo,
      deltaFacilidad,
      deltaInteracciones,
      deltaManuales
    };
  }
}

