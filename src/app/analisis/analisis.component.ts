import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../services/data.service';
import { VersionService } from '../services/version.service';
import { WorkflowService } from '../services/workflow.service';
import { ScenarioService, ScenarioRunSummary } from '../services/scenario.service';
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
      scenarios: this.sortedSummaries,
      pairDeltas: this.pairGroups.map(g => ({
        pair: g.id,
        patient: g.label,
        sinIA: g.s1 ? { id: g.s1id, tiempoTotalMin: g.s1.tiempoTotalMin, interaccionesTotal: g.s1.interaccionesTotal, facilidadPromedio: g.s1.facilidadPromedio } : null,
        conIA: g.s2 ? { id: g.s2id, tiempoTotalMin: g.s2.tiempoTotalMin, interaccionesTotal: g.s2.interaccionesTotal, facilidadPromedio: g.s2.facilidadPromedio } : null,
        delta: g.delta
      }))
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
      'stepsCompleted', 'totalSteps', 'ejecucionesCompletadas', 'finishedAt'
    ];
    const rows = this.sortedSummaries.map(s => [
      s.scenarioId, s.mode, s.patientName,
      s.tiempoTotalMin ?? '', s.tiempoPromedioMin ?? '',
      s.facilidadPromedio ?? '', s.interaccionesTotal ?? '', s.clicksPromedio ?? '',
      s.camposAutocompletados ?? '', s.camposManuales ?? '',
      s.stepsCompleted, s.totalSteps, s.ejecucionesCompletadas, s.finishedAt
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
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

