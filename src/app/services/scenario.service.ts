import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { VersionMode, ScenarioPatientPreset, OrdenValidacion, FlujoTrabajo, FlujoAsignado } from '../models/nutricion.models';
import { DataService } from './data.service';
import { WorkflowService } from './workflow.service';
import { VersionService } from './version.service';

export type ScenarioId = 'A1' | 'A2' | 'B1' | 'B2';
export type ScenarioState = 'idle' | 'in-progress' | 'completed';

export interface ScenarioDefinition {
  id: ScenarioId;
  title: string;
  patientName: string;
  patientId: string;
  mode: VersionMode;
  description: string;
  requiredMealTimes: 3 | 5;
  recommendedOrder: number;
  patientPreset: ScenarioPatientPreset;
  flujoId: string;
  visits: ScenarioVisit[];
}

export interface ScenarioVisit {
  id: string;
  title: string;
  instructions: string[];
  expectedOutcome: string;
  targetMinutes: number;
  route: string;
  completionPasoIds?: string[];
}

export interface ActiveScenarioProgress {
  scenarioId: ScenarioId;
  visitId: string;
  stepIndex: number;
  completedVisits: string[];
  startedAt: string;
}

interface ScenarioHistoryEntry {
  scenarioId: ScenarioId;
  completedVisits: string[];
  finishedAt: string;
  tiempoTotalMin?: number;
  clicksTotales?: number;
}

export interface ScenarioRunSummary {
  scenarioId: ScenarioId;
  scenarioTitle: string;
  patientId: string;
  patientName: string;
  mode: VersionMode;
  completedVisits: string[];
  finishedAt: string;
  ejecucionesCompletadas: number;
  tiempoTotalMin?: number;
  tiempoPromedioMin?: number;
  facilidadPromedio?: number;
  camposAutocompletados?: number;
  camposManuales?: number;
  interaccionesTotal?: number;
  clicksPromedio?: number;
  stepsCompleted: number;
  totalSteps: number;
}

@Injectable({
  providedIn: 'root'
})
export class ScenarioService {
  private readonly STORAGE_STATE = 'scenario_states';
  private readonly STORAGE_PROGRESS = 'scenario_progress';
  private readonly STORAGE_SUMMARIES = 'scenario_summaries';
  private readonly STORAGE_HISTORY = `${this.STORAGE_PROGRESS}_history`;
  private activeScenarioClickCount = 0;

  private readonly scenarios: ScenarioDefinition[] = [
    {
      id: 'A1',
      title: 'Paciente A / Manual',
      patientName: 'Lucía Pérez',
      patientId: 'pac_manual',
      mode: 'sin-ia',
      description: 'Flujo manual tradicional para paciente A.',
      requiredMealTimes: 3,
      recommendedOrder: 1,
      patientPreset: {
        edad: 34,
        peso: 66,
        altura: 167,
        actividad: 'moderado',
        objetivo: 'perder',
        masaGrasa: 19,
        masaMagra: 47,
        notas: 'Registrar Peso, Altura, Masa grasa/magra y objetivo "Definir plan mediterráneo 1.850 kcal". La pauta final debe quedar en 3 tiempos de comida: desayuno, almuerzo y cena.'
      },
      flujoId: 'flujo_manual_sin_ia',
      visits: this.buildStandardVisits('sin-ia')
    },
    {
      id: 'A2',
      title: 'Paciente A / IA',
      patientName: 'Lucía Pérez',
      patientId: 'pac_manual',
      mode: 'con-ia',
      description: 'Flujo asistido con IA para paciente A.',
      requiredMealTimes: 3,
      recommendedOrder: 2,
      patientPreset: {
        edad: 34,
        peso: 66,
        altura: 167,
        actividad: 'moderado',
        objetivo: 'perder',
        masaGrasa: 19,
        masaMagra: 47,
        notas: 'Registrar Peso 66 kg, Altura 167 cm, Masa grasa 19 kg, Masa magra 47 kg manualmente. IA sugiere plan y objetivos de macros. La pauta final debe quedar en 3 tiempos de comida: desayuno, almuerzo y cena.'
      },
      flujoId: 'flujo_asistido_ia',
      visits: this.buildStandardVisits('con-ia')
    },
    {
      id: 'B1',
      title: 'Paciente B / Manual',
      patientName: 'Diego Torres',
      patientId: 'pac_ia',
      mode: 'sin-ia',
      description: 'Flujo manual para paciente B.',
      requiredMealTimes: 5,
      recommendedOrder: 3,
      patientPreset: {
        edad: 41,
        peso: 82,
        altura: 175,
        actividad: 'ligero',
        objetivo: 'mantener',
        masaGrasa: 24,
        masaMagra: 58,
        notas: 'Registrar antecedentes hipertensión y definir objetivo de recomposición (82kg a 79kg). La pauta final debe quedar en 5 tiempos de comida: desayuno, media mañana, almuerzo, colación y cena.'
      },
      flujoId: 'flujo_manual_sin_ia',
      visits: this.buildStandardVisits('sin-ia')
    },
    {
      id: 'B2',
      title: 'Paciente B / IA',
      patientName: 'Diego Torres',
      patientId: 'pac_ia',
      mode: 'con-ia',
      description: 'Flujo asistido con IA para paciente B.',
      requiredMealTimes: 5,
      recommendedOrder: 4,
      patientPreset: {
        edad: 41,
        peso: 82,
        altura: 175,
        actividad: 'ligero',
        objetivo: 'mantener',
        masaGrasa: 24,
        masaMagra: 58,
        notas: 'Registrar Peso 82 kg, Altura 175 cm, Masa grasa 24 kg, Masa magra 58 kg manualmente. Antecedente HTA. IA sugiere objetivo 2.100 kcal. La pauta final debe quedar en 5 tiempos de comida: desayuno, media mañana, almuerzo, colación y cena.'
      },
      flujoId: 'flujo_asistido_ia',
      visits: this.buildStandardVisits('con-ia')
    }
  ];

  private scenarioStatesSubject = new BehaviorSubject<Record<ScenarioId, ScenarioState>>(this.loadScenarioStates());
  scenarioStates$ = this.scenarioStatesSubject.asObservable();

  private activeProgressSubject = new BehaviorSubject<ActiveScenarioProgress | null>(this.loadProgress());
  activeProgress$ = this.activeProgressSubject.asObservable();

  private scenarioSummariesSubject = new BehaviorSubject<Record<ScenarioId, ScenarioRunSummary | null>>(this.loadScenarioSummaries());
  scenarioSummaries$ = this.scenarioSummariesSubject.asObservable();

  constructor(
    @Inject(DOCUMENT) private document: Document,
    private dataService: DataService,
    private workflowService: WorkflowService,
    private versionService: VersionService
  ) {
    this.document.addEventListener('click', this.handleDocumentClick, true);
    this.workflowService.asignaciones$.subscribe(() => {
      this.syncProgressWithWorkflow();
    });
  }

  getScenario(id: ScenarioId): ScenarioDefinition {
    const found = this.scenarios.find(s => s.id === id);
    if (!found) {
      throw new Error(`Scenario ${id} not found`);
    }
    return found;
  }

  getScenarios(): ScenarioDefinition[] {
    return this.scenarios;
  }

  getActiveClickCount(): number {
    return this.activeScenarioClickCount;
  }

  getLatestAssignmentId(patientId: string, flujoId: string): string | null {
    return this.getLatestScenarioAssignment(patientId, flujoId)?.id ?? null;
  }

  getCurrentScenario(): { scenario: ScenarioDefinition; progress: ActiveScenarioProgress } | null {
    const progress = this.activeProgressSubject.value;
    if (!progress) {
      return null;
    }
    return {
      scenario: this.getScenario(progress.scenarioId),
      progress
    };
  }

  startScenario(id: ScenarioId): void {
    const scenario = this.getScenario(id);
    const states = { ...this.scenarioStatesSubject.value };
    if (states[id] === 'in-progress') {
      return;
    }
    this.dataService.resetToSeedData();
    this.versionService.setVersion(scenario.mode);
    this.syncScenarioAssignment(scenario);
    Object.keys(states).forEach(key => {
      const k = key as ScenarioId;
      if (states[k] === 'in-progress') {
        states[k] = 'idle';
      }
    });

    states[id] = 'in-progress';
    this.activeScenarioClickCount = 0;
    const progress: ActiveScenarioProgress = {
      scenarioId: id,
      visitId: scenario.visits[0].id,
      stepIndex: 0,
      completedVisits: [],
      startedAt: new Date().toISOString()
    };

    this.persistStates(states);
    this.persistProgress(progress);
  }

  resetScenario(id: ScenarioId): void {
    const states = { ...this.scenarioStatesSubject.value };
    states[id] = 'idle';
    this.persistStates(states);
    if (this.activeProgressSubject.value?.scenarioId === id) {
      this.activeScenarioClickCount = 0;
      this.persistProgress(null);
    }
  }

  resetAllScenarios(): void {
    this.activeScenarioClickCount = 0;
    const defaults = this.getDefaultStates();
    this.persistStates(defaults);
    this.persistProgress(null);
    this.persistSummaries(this.getSummaryDefaults());
    try {
      localStorage.removeItem(this.STORAGE_HISTORY);
    } catch (error) {
      console.error('Error clearing scenario history', error);
    }
  }

  syncWithWorkflowNow(): void {
    this.syncProgressWithWorkflow();
  }

  private syncScenarioAssignment(scenario: ScenarioDefinition): void {
    const orden: OrdenValidacion = scenario.mode === 'con-ia' ? 'ia-primero' : 'manual-primero';
    try {
      this.workflowService.assignFlujoToPaciente(
        scenario.patientId,
        scenario.flujoId,
        scenario.mode,
        {
          ordenValidacion: orden,
          iteracionEtiqueta: `${scenario.id} · ${scenario.patientName} · ${scenario.mode === 'con-ia' ? 'Con IA' : 'Sin IA'}`,
          responsable: 'Scenario Wizard',
          forceReassign: true
        }
      );
    } catch (error) {
      console.error('Error sincronizando flujo del escenario', error);
    }
  }

  private syncProgressWithWorkflow(): void {
    const progress = this.activeProgressSubject.value;
    if (!progress) {
      return;
    }

    const scenario = this.getScenario(progress.scenarioId);
    const flujo = this.workflowService.getFlujoById(scenario.flujoId);
    const asignacion = this.getLatestScenarioAssignment(scenario.patientId, scenario.flujoId);
    if (!flujo || !asignacion) {
      return;
    }

    const sequentiallyCompleted = this.getCompletedVisitsFromWorkflow(flujo, scenario.visits, asignacion.ejecucion);

    if (sequentiallyCompleted.length === scenario.visits.length) {
      this.finishScenario(scenario.id, sequentiallyCompleted);
      return;
    }

    const hasChanges =
      sequentiallyCompleted.length !== progress.completedVisits.length ||
      sequentiallyCompleted.some((id, index) => progress.completedVisits[index] !== id);

    if (!hasChanges) {
      return;
    }

    const nextVisit = scenario.visits[sequentiallyCompleted.length];
    if (!nextVisit) {
      return;
    }

    const updatedProgress: ActiveScenarioProgress = {
      ...progress,
      completedVisits: sequentiallyCompleted,
      visitId: nextVisit.id,
      stepIndex: sequentiallyCompleted.length
    };
    this.persistProgress(updatedProgress);
  }

  private getLatestScenarioAssignment(patientId: string, flujoId: string): FlujoAsignado | null {
    const matching = this.workflowService
      .getAsignacionesByPaciente(patientId)
      .filter(asignacion => asignacion.flujoId === flujoId);

    if (!matching.length) {
      return null;
    }

    const activeAssignments = matching.filter(a => a.estado !== 'completado');
    if (activeAssignments.length) {
      return [...activeAssignments].sort((a, b) => {
        const dateA = new Date(a.fechaAsignacion).getTime();
        const dateB = new Date(b.fechaAsignacion).getTime();
        return dateB - dateA;
      })[0];
    }

    return [...matching].sort((a, b) => {
      const endA = a.ejecucion
        .filter(e => !!e.fin)
        .map(e => new Date(e.fin as string).getTime())
        .sort((x, y) => y - x)[0] ?? 0;
      const endB = b.ejecucion
        .filter(e => !!e.fin)
        .map(e => new Date(e.fin as string).getTime())
        .sort((x, y) => y - x)[0] ?? 0;
      if (endA !== endB) {
        return endB - endA;
      }
      const dateA = new Date(a.fechaAsignacion).getTime();
      const dateB = new Date(b.fechaAsignacion).getTime();
      return dateB - dateA;
    })[0];
  }

  private getCompletedVisitsFromWorkflow(
    flujo: FlujoTrabajo,
    visits: ScenarioVisit[],
    ejecuciones: { pasoId: string; fin?: string }[]
  ): string[] {
    const completed: string[] = [];
    for (const visit of visits) {
      const completedVisit = this.isVisitCompleted(visit, flujo, ejecuciones);
      if (completedVisit) {
        completed.push(visit.id);
      } else {
        break;
      }
    }
    return completed;
  }

  private isVisitCompleted(
    visit: ScenarioVisit,
    flujo: FlujoTrabajo,
    ejecuciones: { pasoId: string; fin?: string }[]
  ): boolean {
    if (visit.completionPasoIds && visit.completionPasoIds.length > 0) {
      const validPasoIds = visit.completionPasoIds.filter(pasoId => flujo.pasos.some(p => p.id === pasoId));
      if (validPasoIds.length > 0) {
        return validPasoIds.every(pasoId => ejecuciones.some(e => e.pasoId === pasoId && !!e.fin));
      }
      return false;
    }

    const pasosModulo = flujo.pasos.filter(paso => paso.modulo === visit.route);
    return pasosModulo.length === 0
      ? true
      : pasosModulo.every(paso => ejecuciones.some(e => e.pasoId === paso.id && !!e.fin));
  }

  private finishScenario(id: ScenarioId, completedVisits: string[]): void {
    const scenario = this.getScenario(id);
    const progress = this.activeProgressSubject.value;
    const finishedAt = new Date().toISOString();
    const tiempoTotalMin = progress
      ? Math.max(0, (new Date(finishedAt).getTime() - new Date(progress.startedAt).getTime()) / 60000)
      : undefined;
    const clicksTotales = this.activeScenarioClickCount;
    const states = { ...this.scenarioStatesSubject.value };
    states[id] = 'completed';
    this.persistStates(states);
    this.persistProgress(null);
    const history = this.loadFromStorage(this.STORAGE_HISTORY, [] as ScenarioHistoryEntry[]);
    history.push({
      scenarioId: id,
      completedVisits,
      finishedAt,
      tiempoTotalMin,
      clicksTotales
    });
    this.saveToStorage(this.STORAGE_HISTORY, history);
    this.activeScenarioClickCount = 0;
    this.captureScenarioSummary(scenario, completedVisits);
  }

  private buildStandardVisits(mode: VersionMode): ScenarioVisit[] {
    const ia = mode === 'con-ia';
    return [
      {
        id: 'visita_1',
        title: 'Fase 1 – Registro del Paciente',
        instructions: ia
          ? [
              'Completar la ficha base con asistencia IA',
              'Validar datos autocompletados y corregir inconsistencias',
              'Confirmar datos clínicos mínimos antes de pasar a cálculo'
            ]
          : [
              'Completar ficha manual y antecedentes',
              'Registrar actividad, objetivo y datos antropométricos base',
              'Confirmar que la ficha queda lista para cálculo nutricional'
            ],
        expectedOutcome: 'Ficha clínica completa y validada para cálculo.',
        targetMinutes: ia ? 20 : 30,
        route: 'pacientes',
        completionPasoIds: [ia ? 'pacientes_ia_1' : 'pacientes_1']
      },
      {
        id: 'visita_2',
        title: 'Fase 2 – Cálculo Nutricional',
        instructions: ia
          ? [
              'Calcular requerimiento energético con asistencia IA',
              'Validar TMB y calorías objetivo sugeridas',
              'Confirmar base energética antes de definir macros'
            ]
          : [
              'Calcular TMB y calorías objetivo',
              'Validar coherencia entre objetivo clínico y calorías',
              'Dejar lista la base para definir macros diarios'
            ],
        expectedOutcome: 'Base energética validada para el paciente.',
        targetMinutes: ia ? 10 : 16,
        route: 'evaluacion',
        completionPasoIds: [ia ? 'evaluacion_ia_1' : 'evaluacion_1']
      },
      {
        id: 'visita_3',
        title: 'Fase 3 – Definición de Macros Diarios',
        instructions: ia
          ? [
              'Generar propuesta de macros diarios con IA',
              'Ajustar distribución proteína, carbohidratos y grasas',
              'Validar macros diarios antes de pasar al cierre'
            ]
          : [
              'Definir macros diarios por objetivo clínico',
              'Comprobar equilibrio entre proteína, carbohidratos y grasas',
              'Confirmar macros diarios para iniciar cierre de pauta'
            ],
        expectedOutcome: 'Macros diarios aprobados para construir pauta semanal.',
        targetMinutes: ia ? 8 : 12,
        route: 'evaluacion',
        completionPasoIds: [ia ? 'evaluacion_ia_2' : 'evaluacion_2']
      },
      {
        id: 'visita_4',
        title: 'Fase 4 – Cierre de Pauta',
        instructions: ia
          ? [
              'Armar pauta semanal final a partir de macros aprobados',
              'Revisar menú sugerido y ajustes clínicos finales',
              'Guardar pauta definitiva y cerrar el flujo'
            ]
          : [
              'Construir pauta semanal final con porciones definidas',
              'Revisar consistencia entre menú, macros y objetivo',
              'Guardar pauta definitiva y cerrar el flujo'
            ],
        expectedOutcome: 'Pauta guardada y flujo de simulación completado.',
        targetMinutes: ia ? 10 : 15,
        route: 'evaluacion',
        completionPasoIds: ia
          ? ['evaluacion_ia_3', 'evaluacion_ia_4']
          : ['evaluacion_3', 'evaluacion_4']
      }
    ];
  }

  private loadScenarioStates(): Record<ScenarioId, ScenarioState> {
    return this.loadFromStorage(this.STORAGE_STATE, this.getDefaultStates());
  }

  private getDefaultStates(): Record<ScenarioId, ScenarioState> {
    return {
      A1: 'idle',
      A2: 'idle',
      B1: 'idle',
      B2: 'idle'
    };
  }

  private persistStates(states: Record<ScenarioId, ScenarioState>) {
    this.scenarioStatesSubject.next(states);
    this.saveToStorage(this.STORAGE_STATE, states);
  }

  private loadProgress(): ActiveScenarioProgress | null {
    return this.loadFromStorage(this.STORAGE_PROGRESS, null);
  }

  private loadScenarioSummaries(): Record<ScenarioId, ScenarioRunSummary | null> {
    const defaults = this.getSummaryDefaults();
    const stored = this.loadFromStorage<Record<ScenarioId, ScenarioRunSummary | null>>(this.STORAGE_SUMMARIES, defaults);
    return { ...defaults, ...stored };
  }

  private getSummaryDefaults(): Record<ScenarioId, ScenarioRunSummary | null> {
    return {
      A1: null,
      A2: null,
      B1: null,
      B2: null
    };
  }

  private persistSummaries(summaries: Record<ScenarioId, ScenarioRunSummary | null>) {
    this.scenarioSummariesSubject.next(summaries);
    this.saveToStorage(this.STORAGE_SUMMARIES, summaries);
  }

  private persistProgress(progress: ActiveScenarioProgress | null) {
    this.activeProgressSubject.next(progress);
    if (progress) {
      this.saveToStorage(this.STORAGE_PROGRESS, progress);
    } else {
      localStorage.removeItem(this.STORAGE_PROGRESS);
    }
  }

  private loadFromStorage<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return fallback;
      }
      return JSON.parse(raw);
    } catch (error) {
      console.error('Error loading scenario data', error);
      return fallback;
    }
  }

  private saveToStorage<T>(key: string, value: T) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving scenario data', error);
    }
  }

  private captureScenarioSummary(scenario: ScenarioDefinition, completedVisits: string[]) {
    const assignments = this.workflowService.getAsignacionesByPaciente(scenario.patientId)
      .filter(a => a.flujoId === scenario.flujoId && a.estado === 'completado');
    const latestAssignment = assignments
      .sort((a, b) => {
        const endA = a.ejecucion
          .filter(e => !!e.fin)
          .map(e => new Date(e.fin as string).getTime())
          .sort((x, y) => y - x)[0] ?? 0;
        const endB = b.ejecucion
          .filter(e => !!e.fin)
          .map(e => new Date(e.fin as string).getTime())
          .sort((x, y) => y - x)[0] ?? 0;
        if (endA !== endB) {
          return endB - endA;
        }
        return new Date(b.fechaAsignacion).getTime() - new Date(a.fechaAsignacion).getTime();
      })[0];

    const finishedAt = latestAssignment?.ejecucion
      .filter(e => e.fin)
      .map(e => new Date(e.fin as string).getTime())
      .sort((a, b) => b - a)[0];

    const history = this.loadFromStorage(this.STORAGE_HISTORY, [] as ScenarioHistoryEntry[])
      .filter(entry => entry.scenarioId === scenario.id);
    const latestHistoryEntry = [...history]
      .sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime())[0];

    const ejecucionesCompletadas = assignments.length;
    const tiempoPromedioMin = history.length > 0
      ? history.reduce((sum, entry) => sum + (entry.tiempoTotalMin || 0), 0) / history.length
      : undefined;
    const clicksPromedio = history.length > 0
      ? history.reduce((sum, entry) => sum + (entry.clicksTotales || 0), 0) / history.length
      : undefined;

    const summary: ScenarioRunSummary = {
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      patientId: scenario.patientId,
      patientName: scenario.patientName,
      mode: scenario.mode,
      completedVisits,
      finishedAt: latestHistoryEntry?.finishedAt || (finishedAt ? new Date(finishedAt).toISOString() : new Date().toISOString()),
      ejecucionesCompletadas: history.length || ejecucionesCompletadas,
      tiempoTotalMin: latestHistoryEntry?.tiempoTotalMin ?? latestAssignment?.resultado?.tiempoTotalMin,
      tiempoPromedioMin,
      facilidadPromedio: latestAssignment?.resultado?.facilidadPromedio,
      camposAutocompletados: latestAssignment?.resultado?.camposAutocompletadosTotal,
      camposManuales: latestAssignment?.resultado?.camposManualesTotal,
      interaccionesTotal: latestHistoryEntry?.clicksTotales ?? latestAssignment?.resultado?.interaccionesTotal,
      clicksPromedio,
      stepsCompleted: latestAssignment?.resultado?.pasosCompletados ?? completedVisits.length,
      totalSteps: latestAssignment?.resultado?.totalPasos ?? scenario.visits.length
    };

    const updated = { ...this.scenarioSummariesSubject.value, [scenario.id]: summary };
    this.persistSummaries(updated);
  }

  private readonly handleDocumentClick = () => {
    if (!this.activeProgressSubject.value) {
      return;
    }
    this.activeScenarioClickCount += 1;
  };
}
