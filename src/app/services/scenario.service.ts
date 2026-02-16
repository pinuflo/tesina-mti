import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { VersionMode, ScenarioPatientPreset, OrdenValidacion, FlujoTrabajo } from '../models/nutricion.models';
import { DataService } from './data.service';
import { WorkflowService } from './workflow.service';

export type ScenarioId = 'A1' | 'A2' | 'B1' | 'B2';
export type ScenarioState = 'idle' | 'in-progress' | 'completed';

export interface ScenarioDefinition {
  id: ScenarioId;
  title: string;
  patientName: string;
  patientId: string;
  mode: VersionMode;
  description: string;
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
}

export interface ActiveScenarioProgress {
  scenarioId: ScenarioId;
  visitId: string;
  stepIndex: number;
  completedVisits: string[];
  startedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class ScenarioService {
  private readonly STORAGE_STATE = 'scenario_states';
  private readonly STORAGE_PROGRESS = 'scenario_progress';

  private readonly scenarios: ScenarioDefinition[] = [
    {
      id: 'A1',
      title: 'Paciente A / Manual',
      patientName: 'Lucía Pérez',
      patientId: 'pac_manual',
      mode: 'sin-ia',
      description: 'Flujo manual tradicional para paciente A.',
      patientPreset: {
        edad: 34,
        peso: 66,
        altura: 167,
        actividad: 'moderado',
        objetivo: 'perder',
        masaGrasa: 19,
        masaMagra: 47,
        notas: 'Registrar Peso, Altura, Masa grasa/magra y objetivo "Definir plan mediterráneo 1.850 kcal".'
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
      patientPreset: {
        edad: 34,
        peso: 66,
        altura: 167,
        actividad: 'moderado',
        objetivo: 'perder',
        notas: 'Permitir que la IA estime masa grasa/magra. Verificar que IA autocomplete hábitos y recordatorio 24h.'
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
      patientPreset: {
        edad: 41,
        peso: 82,
        altura: 175,
        actividad: 'ligero',
        objetivo: 'mantener',
        masaGrasa: 24,
        masaMagra: 58,
        notas: 'Registrar antecedentes hipertensión y definir objetivo de recomposición (82kg a 79kg).'
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
      patientPreset: {
        edad: 41,
        peso: 82,
        altura: 175,
        actividad: 'moderado',
        objetivo: 'mantener',
        notas: 'Carga mínima manual: Peso, Altura, Antecedente HTA. IA debe sugerir objetivo 2.100 kcal y lista compras.'
      },
      flujoId: 'flujo_asistido_ia',
      visits: this.buildStandardVisits('con-ia')
    }
  ];

  private scenarioStatesSubject = new BehaviorSubject<Record<ScenarioId, ScenarioState>>(this.loadScenarioStates());
  scenarioStates$ = this.scenarioStatesSubject.asObservable();

  private activeProgressSubject = new BehaviorSubject<ActiveScenarioProgress | null>(this.loadProgress());
  activeProgress$ = this.activeProgressSubject.asObservable();

  constructor(private dataService: DataService, private workflowService: WorkflowService) {
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
    this.syncScenarioAssignment(scenario);
    Object.keys(states).forEach(key => {
      const k = key as ScenarioId;
      if (states[k] === 'in-progress') {
        states[k] = 'idle';
      }
    });

    states[id] = 'in-progress';
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
      this.persistProgress(null);
    }
  }

  resetAllScenarios(): void {
    const defaults = this.getDefaultStates();
    this.persistStates(defaults);
    this.persistProgress(null);
    try {
      localStorage.removeItem(`${this.STORAGE_PROGRESS}_history`);
    } catch (error) {
      console.error('Error clearing scenario history', error);
    }
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
          iteracionEtiqueta: `${scenario.patientName} · ${scenario.mode === 'con-ia' ? 'Con IA' : 'Sin IA'}`,
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
    const asignacion = this.workflowService.getAsignacionActiva(scenario.patientId);
    if (!flujo || !asignacion || asignacion.flujoId !== scenario.flujoId) {
      return;
    }

    const sequentiallyCompleted = this.getCompletedVisitsFromWorkflow(flujo, scenario.visits, asignacion.ejecucion);
    const hasChanges =
      sequentiallyCompleted.length !== progress.completedVisits.length ||
      sequentiallyCompleted.some((id, index) => progress.completedVisits[index] !== id);

    if (!hasChanges) {
      return;
    }

    if (sequentiallyCompleted.length === scenario.visits.length) {
      this.finishScenario(scenario.id, sequentiallyCompleted);
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

  private getCompletedVisitsFromWorkflow(
    flujo: FlujoTrabajo,
    visits: ScenarioVisit[],
    ejecuciones: { pasoId: string; fin?: string }[]
  ): string[] {
    const completed: string[] = [];
    for (const visit of visits) {
      const pasosModulo = flujo.pasos.filter(paso => paso.modulo === visit.route);
      const moduloCompletado = pasosModulo.length === 0
        ? true
        : pasosModulo.every(paso => ejecuciones.some(e => e.pasoId === paso.id && !!e.fin));
      if (moduloCompletado) {
        completed.push(visit.id);
      } else {
        break;
      }
    }
    return completed;
  }

  private finishScenario(id: ScenarioId, completedVisits: string[]): void {
    const states = { ...this.scenarioStatesSubject.value };
    states[id] = 'completed';
    this.persistStates(states);
    this.persistProgress(null);
    const summaryKey = `${this.STORAGE_PROGRESS}_history`;
    const history = this.loadFromStorage(summaryKey, [] as any[]);
    history.push({
      scenarioId: id,
      completedVisits,
      finishedAt: new Date().toISOString()
    });
    this.saveToStorage(summaryKey, history);
  }

  private buildStandardVisits(mode: VersionMode): ScenarioVisit[] {
    const ia = mode === 'con-ia';
    return [
      {
        id: 'visita_1',
        title: 'Fase 1 – Evaluación Inicial',
        instructions: ia
          ? [
              'Ejecutar importación de ficha con IA',
              'Validar datos autocompletados y registrar observaciones',
              'Confirmar consentimiento informado para uso de IA'
            ]
          : [
              'Completar ficha manual y recordatorio 24h',
              'Registrar hábitos y antecedentes',
              'Documentar cálculos de TMB inicial'
            ],
        expectedOutcome: 'Ficha completa + objetivos energéticos definidos.',
          targetMinutes: ia ? 25 : 45,
          route: 'pacientes'
      },
      {
        id: 'visita_2',
        title: 'Fase 2 – Evaluación Antropométrica',
        instructions: ia
          ? [
              'Correr simulación y obtener pauta sugerida',
              'Aprobar/ajustar macros y menú generado',
              'Registrar proyección automática de resultados'
            ]
          : [
              'Calcular TMB con fórmula manual',
              'Definir calorías y macros objetivo',
              'Registrar pauta manual en seguimiento'
            ],
        expectedOutcome: 'Plan alimentario alineado con pauta mediterránea 1800 kcal.',
          targetMinutes: ia ? 20 : 35,
          route: 'evaluacion'
      },
      {
        id: 'visita_3',
        title: 'Fase 3 – Análisis',
        instructions: ia
          ? [
              'Revisar insights avanzados y alertas IA',
              'Comparar esfuerzo vs flujo manual de mismo paciente',
              'Guardar KPIs automáticos y notas'
            ]
          : [
              'Analizar indicadores manuales (IMC, adherencia)',
              'Documentar hallazgos clave',
              'Comparar progreso con objetivo final'
            ],
        expectedOutcome: 'Informe con riesgos y acciones priorizadas.',
          targetMinutes: ia ? 15 : 25,
          route: 'analisis'
      },
      {
        id: 'visita_4',
        title: 'Fase 4 – Seguimiento Final',
        instructions: ia
          ? [
              'Simular alertas y notificaciones automáticas',
              'Confirmar adherencia proyectada por IA',
              'Cerrar flujo registrando ahorro de tiempo'
            ]
          : [
              'Registrar progreso manual y decisiones del profesional',
              'Planificar próxima consulta',
              'Cerrar flujo con checklist de consistencia'
            ],
        expectedOutcome: 'Resultado final documentado con mismo plan para ambos modos.',
          targetMinutes: ia ? 15 : 30,
          route: 'seguimiento'
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
}
