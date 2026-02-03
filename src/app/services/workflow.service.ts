import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  FlujoAsignado,
  FlujoObjetivoFinal,
  FlujoResultado,
  FlujoTrabajo,
  OrdenValidacion,
  PasoEjecucion,
  PasoFlujo,
  VersionMode
} from '../models/nutricion.models';
import { WorkflowLogService } from './workflow-log.service';
import { DataService } from './data.service';

interface CompletePasoPayload {
  facilidad?: number;
  comentarios?: string;
  camposAutocompletados?: number;
  camposManuales?: number;
  tiempoMinutos?: number;
}

interface AssignOptions {
  ordenValidacion?: OrdenValidacion;
  iteracionEtiqueta?: string;
  fechaAsignacion?: string;
}

interface ScenarioStepSeed {
  pasoId: string;
  facilidad: number;
  camposAutocompletados: number;
  camposManuales: number;
  tiempoMinutos: number;
}

interface ScenarioSeed {
  pacienteId: string;
  flujoId: string;
  modo: VersionMode;
  pasosCompletados: ScenarioStepSeed[];
  iteracionEtiqueta?: string;
  ordenValidacion?: OrdenValidacion;
  fechaAsignacion?: string;
  offsetDias?: number;
}

@Injectable({
  providedIn: 'root'
})
export class WorkflowService {
  private readonly STORAGE_FLOWS = 'workflow_flujos';
  private readonly STORAGE_ASSIGNMENTS = 'workflow_asignaciones';

  private flujosSubject = new BehaviorSubject<FlujoTrabajo[]>([]);
  flujos$ = this.flujosSubject.asObservable();

  private asignacionesSubject = new BehaviorSubject<FlujoAsignado[]>([]);
  asignaciones$ = this.asignacionesSubject.asObservable();

  constructor(private logService: WorkflowLogService, private dataService: DataService) {
    this.loadData();
    this.seedScenarioAssignments();
  }

  getFlujos(): FlujoTrabajo[] {
    return this.flujosSubject.value;
  }

  getFlujoById(id: string): FlujoTrabajo | undefined {
    return this.flujosSubject.value.find(f => f.id === id);
  }

  getAsignaciones(): FlujoAsignado[] {
    return this.asignacionesSubject.value;
  }

  getAsignacionesByPaciente(pacienteId: string): FlujoAsignado[] {
    return this.asignacionesSubject.value.filter(a => a.pacienteId === pacienteId);
  }

  getAsignacionActiva(pacienteId: string): FlujoAsignado | undefined {
    return this.getAsignacionesByPaciente(pacienteId).find(a => a.estado !== 'completado');
  }

  assignFlujoToPaciente(
    pacienteId: string,
    flujoId: string,
    modo: VersionMode,
    options: AssignOptions = {}
  ): FlujoAsignado {
    const existentes = this.asignacionesSubject.value;
    const yaAsignado = existentes.find(a => a.pacienteId === pacienteId && a.estado !== 'completado');
    if (yaAsignado) {
      return yaAsignado;
    }

    const flujo = this.getFlujoById(flujoId);
    const nuevaAsignacion: FlujoAsignado = {
      id: this.generateId(),
      pacienteId,
      flujoId,
      modoEjecutado: modo,
      fechaAsignacion: options.fechaAsignacion ?? new Date().toISOString(),
      estado: 'pendiente',
      pasoActualId: null,
      ejecucion: [],
      objetivoFinal: flujo?.objetivoFinal,
      iteracionEtiqueta: options.iteracionEtiqueta,
      ordenValidacion: options.ordenValidacion
    };

    const asignaciones = [...existentes, nuevaAsignacion];
    this.setAsignaciones(asignaciones);
    return nuevaAsignacion;
  }

  startPaso(asignacionId: string, pasoId: string): PasoEjecucion | null {
    const asignaciones = [...this.asignacionesSubject.value];
    const index = asignaciones.findIndex(a => a.id === asignacionId);
    if (index === -1) {
      return null;
    }

    const asignacion = { ...asignaciones[index] };
    const pasoExistente = asignacion.ejecucion.find(e => e.pasoId === pasoId && !e.fin);
    if (pasoExistente) {
      return pasoExistente;
    }

    const log = this.logService.startStep(asignacion.pacienteId, asignacion.flujoId, pasoId, asignacion.modoEjecutado);
    const ejecucionEntrada: PasoEjecucion = {
      pasoId,
      logId: log.id,
      inicio: log.inicio
    };

    asignacion.ejecucion = [...asignacion.ejecucion, ejecucionEntrada];
    asignacion.pasoActualId = pasoId;
    if (asignacion.estado === 'pendiente') {
      asignacion.estado = 'en-progreso';
    }

    asignaciones[index] = asignacion;
    this.setAsignaciones(asignaciones);
    return ejecucionEntrada;
  }

  completePaso(asignacionId: string, pasoId: string, payload: CompletePasoPayload = {}): FlujoAsignado | null {
    const asignaciones = [...this.asignacionesSubject.value];
    const index = asignaciones.findIndex(a => a.id === asignacionId);
    if (index === -1) {
      return null;
    }

    const asignacion = { ...asignaciones[index] };
    const paso = asignacion.ejecucion.find(e => e.pasoId === pasoId);
    if (!paso) {
      return null;
    }

    if (!paso.fin) {
      const fin = new Date();
      const inicio = new Date(paso.inicio);
      const diffMin = payload.tiempoMinutos ?? Math.max(0, (fin.getTime() - inicio.getTime()) / 60000);
      paso.fin = fin.toISOString();
      paso.tiempoMinutos = diffMin;
      paso.facilidad = payload.facilidad;
      paso.comentarios = payload.comentarios;
      paso.camposAutocompletados = payload.camposAutocompletados;
      paso.camposManuales = payload.camposManuales;
      this.logService.completeStep(paso.logId, {
        facilidad: payload.facilidad,
        comentario: payload.comentarios,
        camposAutocompletados: payload.camposAutocompletados,
        camposManuales: payload.camposManuales,
        tiempoMinutos: diffMin
      });
    }

    const flujo = this.getFlujoById(asignacion.flujoId);
    if (flujo) {
      const pasosOrdenados = [...flujo.pasos].sort((a, b) => a.orden - b.orden);
      const completados = pasosOrdenados.filter(p => asignacion.ejecucion.some(e => e.pasoId === p.id && e.fin));
      const siguiente = pasosOrdenados.find(p => !asignacion.ejecucion.some(e => e.pasoId === p.id && e.fin));
      asignacion.pasoActualId = siguiente ? siguiente.id : null;
      if (completados.length === pasosOrdenados.length) {
        asignacion.estado = 'completado';
        asignacion.resultado = this.calcularResultado(asignacion);
      }
    }

    asignaciones[index] = asignacion;
    this.setAsignaciones(asignaciones);
    return asignacion;
  }

  registrarFacilidad(asignacionId: string, pasoId: string, facilidad: number, comentarios?: string) {
    this.completePaso(asignacionId, pasoId, { facilidad, comentarios });
  }

  getResumenPorModo() {
    const completados = this.asignacionesSubject.value.filter(a => a.estado === 'completado');
    const resumen = completados.reduce((acc, asignacion) => {
      const modo = asignacion.modoEjecutado;
      const actual = acc[modo] || {
        total: 0,
        tiempoTotal: 0,
        facilidad: 0,
        flujos: [] as FlujoAsignado[]
      };
      actual.total += 1;
      if (asignacion.resultado?.tiempoTotalMin) {
        actual.tiempoTotal += asignacion.resultado.tiempoTotalMin;
      }
      if (asignacion.resultado?.facilidadPromedio) {
        actual.facilidad += asignacion.resultado.facilidadPromedio;
      }
      actual.flujos.push(asignacion);
      acc[modo] = actual;
      return acc;
    }, {} as Record<VersionMode, { total: number; tiempoTotal: number; facilidad: number; flujos: FlujoAsignado[] }>);

    return resumen;
  }

  private calcularResultado(asignacion: FlujoAsignado): FlujoResultado {
    const tiempos = asignacion.ejecucion.map(e => e.tiempoMinutos || 0);
    const facilidades = asignacion.ejecucion
      .filter(e => typeof e.facilidad === 'number')
      .map(e => e.facilidad as number);

    const tiempoTotalMin = tiempos.reduce((sum, val) => sum + val, 0);
    const facilidadPromedio = facilidades.length > 0
      ? facilidades.reduce((sum, val) => sum + val, 0) / facilidades.length
      : undefined;

    return {
      tiempoTotalMin,
      facilidadPromedio
    };
  }

  private loadData() {
    const flujos = this.loadFromStorage<FlujoTrabajo[]>(this.STORAGE_FLOWS);
    const asignaciones = this.loadFromStorage<FlujoAsignado[]>(this.STORAGE_ASSIGNMENTS);

    if (flujos && flujos.length > 0) {
      this.flujosSubject.next(flujos);
    } else {
      this.setFlujos(this.getDefaultFlows());
    }

    this.asignacionesSubject.next(asignaciones || []);
  }

  private getDefaultFlows(): FlujoTrabajo[] {
    const flujoManual: FlujoTrabajo = {
      id: 'flujo_manual_sin_ia',
      nombre: 'Protocolo Manual (Sin IA)',
      descripcion: 'Flujo tradicional con cálculos y registros manuales.',
      modoObjetivo: 'sin-ia',
      tiempoEstimadoMin: 120,
      objetivos: [
        'Documentar todo el proceso manualmente',
        'Calcular TMB y distribución de macros sin asistencia',
        'Registrar seguimiento manual'
      ],
      activo: true,
      objetivoFinal: this.getObjetivoComun(),
      pasos: [
        this.createPaso('pacientes_1', 'Registrar paciente y hábitos', 'Completar ficha y recordatorio de 24h.', 'pacientes', 1, 'sin-ia', false, [
          'Completar datos personales',
          'Registrar hábitos y recordatorio 24h',
          'Adjuntar notas clínicas'
        ]),
        this.createPaso('evaluacion_1', 'Evaluación antropométrica', 'Calcular TMB y calorías manualmente.', 'evaluacion', 2, 'sin-ia', false, [
          'Calcular TMB con fórmula Harris-Benedict',
          'Determinar calorías objetivo',
          'Documentar recomendaciones generales'
        ]),
        this.createPaso('analisis_1', 'Análisis estadístico básico', 'Revisar indicadores manuales.', 'analisis', 3, 'sin-ia', false, [
          'Revisar IMC promedio',
          'Comparar objetivos vs resultados',
          'Registrar hallazgos manuales'
        ]),
        this.createPaso('seguimiento_1', 'Seguimiento mensual', 'Registrar progreso y decisiones manuales.', 'seguimiento', 4, 'sin-ia', false, [
          'Registrar peso y adherencia',
          'Anotar decisiones del profesional',
          'Planificar próxima consulta'
        ])
      ]
    };

    const flujoIA: FlujoTrabajo = {
      id: 'flujo_asistido_ia',
      nombre: 'Protocolo Asistido (Con IA)',
      descripcion: 'Flujo acelerado utilizando herramientas inteligentes.',
      modoObjetivo: 'con-ia',
      tiempoEstimadoMin: 75,
      objetivos: [
        'Aprovechar auto-relleno con IA',
        'Generar menús automáticos',
        'Medir ahorro de tiempo y esfuerzo'
      ],
      activo: true,
      objetivoFinal: this.getObjetivoComun(),
      pasos: [
        this.createPaso('pacientes_ia_1', 'Importar paciente', 'Auto-rellenar ficha desde plantilla.', 'pacientes', 1, 'con-ia', true, [
          'Ejecutar importación IA',
          'Validar datos autocompletados',
          'Confirmar consentimiento IA'
        ], [
          'Auto-relleno de hábitos',
          'Clasificación de riesgo metabólico'
        ]),
        this.createPaso('evaluacion_ia_1', 'Evaluación asistida por IA', 'Generar pauta automática y predicciones.', 'evaluacion', 2, 'con-ia', true, [
          'Correr simulación IA',
          'Aprobar pauta sugerida',
          'Registrar ajustes manuales'
        ], [
          'Generar menú inteligente',
          'Predecir progreso 4 semanas'
        ]),
        this.createPaso('analisis_ia_1', 'Insights avanzados', 'Analizar métricas con IA.', 'analisis', 3, 'con-ia', true, [
          'Revisar insights de riesgo',
          'Comparar con flujo manual',
          'Registrar KPIs automáticos'
        ], [
          'Explicar causas raíz',
          'Detectar alertas tempranas'
        ]),
        this.createPaso('seguimiento_ia_1', 'Seguimiento inteligente', 'Automatizar alertas y proyecciones.', 'seguimiento', 4, 'con-ia', true, [
          'Enviar plan automatizado',
          'Registrar sugerencias IA',
          'Confirmar adherencia proyectada'
        ], [
          'Simular alertas de riesgo',
          'Actualizar timeline predictivo'
        ])
      ]
    };

    return [flujoManual, flujoIA];
  }

  private getObjetivoComun(): FlujoObjetivoFinal {
    return {
      descripcion: 'Generar una pauta nutricional con menú mediterráneo equilibrado (1800 kcal) para mejorar recomposición corporal.',
      caloriasObjetivo: 1800,
      proteinasObjetivo: 120,
      carbohidratosObjetivo: 190,
      grasasObjetivo: 60,
      menuSugerido: [
        'Desayuno: Tostadas integrales con palta, tomate y huevos pochados',
        'Media mañana: Yogur griego con frutos rojos y semillas',
        'Almuerzo: Salmón a la plancha con quinoa y ensalada verde',
        'Once: Smoothie de espinaca, plátano y proteína vegetal',
        'Cena: Pechuga de pollo con vegetales asados y hummus'
      ]
    };
  }

  private seedScenarioAssignments() {
    const pacientes = this.dataService.getPacientes();
    if (pacientes.length === 0) {
      return;
    }

    const escenarios: ScenarioSeed[] = [
      {
        pacienteId: 'pac_manual',
        flujoId: 'flujo_manual_sin_ia',
        modo: 'sin-ia' as VersionMode,
        iteracionEtiqueta: 'Caso guía Lucía',
        ordenValidacion: 'manual-primero',
        pasosCompletados: [
          {
            pasoId: 'pacientes_1',
            facilidad: 2,
            camposAutocompletados: 0,
            camposManuales: 12,
            tiempoMinutos: 35
          },
          {
            pasoId: 'evaluacion_1',
            facilidad: 2,
            camposAutocompletados: 0,
            camposManuales: 10,
            tiempoMinutos: 45
          }
        ]
      },
      {
        pacienteId: 'pac_ia',
        flujoId: 'flujo_asistido_ia',
        modo: 'con-ia' as VersionMode,
        iteracionEtiqueta: 'Caso guía Diego',
        ordenValidacion: 'ia-primero',
        pasosCompletados: [
          {
            pasoId: 'pacientes_ia_1',
            facilidad: 4,
            camposAutocompletados: 10,
            camposManuales: 2,
            tiempoMinutos: 12
          },
          {
            pasoId: 'evaluacion_ia_1',
            facilidad: 5,
            camposAutocompletados: 12,
            camposManuales: 1,
            tiempoMinutos: 18
          }
        ]
      },
      ...this.getExperimentalValidationSeeds()
    ];

    escenarios.forEach(escenario => {
      const pacienteExiste = pacientes.some(p => p.id === escenario.pacienteId);
      if (!pacienteExiste) {
        return;
      }
      const yaAsignado = this.asignacionesSubject.value.find(a => a.pacienteId === escenario.pacienteId);
      if (yaAsignado) {
        return;
      }
      const fechaAsignacion = escenario.fechaAsignacion
        ? escenario.fechaAsignacion
        : this.buildFechaAsignacion(escenario.offsetDias ?? 0);
      const asignacion = this.assignFlujoToPaciente(
        escenario.pacienteId,
        escenario.flujoId,
        escenario.modo,
        {
          fechaAsignacion,
          iteracionEtiqueta: escenario.iteracionEtiqueta,
          ordenValidacion: escenario.ordenValidacion
        }
      );
      escenario.pasosCompletados.forEach(paso => {
        this.startPaso(asignacion.id, paso.pasoId);
        this.completePaso(asignacion.id, paso.pasoId, {
          facilidad: paso.facilidad,
          camposAutocompletados: paso.camposAutocompletados,
          camposManuales: paso.camposManuales,
          comentarios: 'Registro simulado para el escenario de validación.',
          tiempoMinutos: paso.tiempoMinutos
        });
      });
    });
  }

  private getExperimentalValidationSeeds(): ScenarioSeed[] {
    return [
      {
        pacienteId: 'pac_validacion_01',
        flujoId: 'flujo_manual_sin_ia',
        modo: 'sin-ia' as VersionMode,
        iteracionEtiqueta: 'Iteración 01',
        ordenValidacion: 'manual-primero',
        offsetDias: -21,
        pasosCompletados: [
          {
            pasoId: 'pacientes_1',
            facilidad: 2,
            camposAutocompletados: 0,
            camposManuales: 11,
            tiempoMinutos: 34
          },
          {
            pasoId: 'evaluacion_1',
            facilidad: 2,
            camposAutocompletados: 0,
            camposManuales: 10,
            tiempoMinutos: 42
          }
        ]
      },
      {
        pacienteId: 'pac_validacion_02',
        flujoId: 'flujo_asistido_ia',
        modo: 'con-ia' as VersionMode,
        iteracionEtiqueta: 'Iteración 02',
        ordenValidacion: 'ia-primero',
        offsetDias: -20,
        pasosCompletados: [
          {
            pasoId: 'pacientes_ia_1',
            facilidad: 4,
            camposAutocompletados: 11,
            camposManuales: 1,
            tiempoMinutos: 13
          },
          {
            pasoId: 'evaluacion_ia_1',
            facilidad: 5,
            camposAutocompletados: 12,
            camposManuales: 1,
            tiempoMinutos: 19
          }
        ]
      },
      {
        pacienteId: 'pac_validacion_03',
        flujoId: 'flujo_manual_sin_ia',
        modo: 'sin-ia' as VersionMode,
        iteracionEtiqueta: 'Iteración 03',
        ordenValidacion: 'manual-primero',
        offsetDias: -19,
        pasosCompletados: [
          {
            pasoId: 'pacientes_1',
            facilidad: 3,
            camposAutocompletados: 0,
            camposManuales: 9,
            tiempoMinutos: 31
          },
          {
            pasoId: 'evaluacion_1',
            facilidad: 3,
            camposAutocompletados: 0,
            camposManuales: 8,
            tiempoMinutos: 38
          }
        ]
      },
      {
        pacienteId: 'pac_validacion_04',
        flujoId: 'flujo_asistido_ia',
        modo: 'con-ia' as VersionMode,
        iteracionEtiqueta: 'Iteración 04',
        ordenValidacion: 'ia-primero',
        offsetDias: -18,
        pasosCompletados: [
          {
            pasoId: 'pacientes_ia_1',
            facilidad: 4,
            camposAutocompletados: 10,
            camposManuales: 2,
            tiempoMinutos: 15
          },
          {
            pasoId: 'evaluacion_ia_1',
            facilidad: 4,
            camposAutocompletados: 11,
            camposManuales: 1,
            tiempoMinutos: 17
          }
        ]
      },
      {
        pacienteId: 'pac_validacion_05',
        flujoId: 'flujo_manual_sin_ia',
        modo: 'sin-ia' as VersionMode,
        iteracionEtiqueta: 'Iteración 05',
        ordenValidacion: 'manual-primero',
        offsetDias: -17,
        pasosCompletados: [
          {
            pasoId: 'pacientes_1',
            facilidad: 2,
            camposAutocompletados: 0,
            camposManuales: 12,
            tiempoMinutos: 36
          },
          {
            pasoId: 'evaluacion_1',
            facilidad: 2,
            camposAutocompletados: 0,
            camposManuales: 11,
            tiempoMinutos: 41
          }
        ]
      },
      {
        pacienteId: 'pac_validacion_06',
        flujoId: 'flujo_asistido_ia',
        modo: 'con-ia' as VersionMode,
        iteracionEtiqueta: 'Iteración 06',
        ordenValidacion: 'ia-primero',
        offsetDias: -16,
        pasosCompletados: [
          {
            pasoId: 'pacientes_ia_1',
            facilidad: 5,
            camposAutocompletados: 12,
            camposManuales: 1,
            tiempoMinutos: 12
          },
          {
            pasoId: 'evaluacion_ia_1',
            facilidad: 5,
            camposAutocompletados: 12,
            camposManuales: 1,
            tiempoMinutos: 16
          }
        ]
      }
    ];
  }

  private buildFechaAsignacion(offsetDays: number): string {
    const base = new Date();
    base.setDate(base.getDate() + offsetDays);
    return base.toISOString();
  }

  private createPaso(
    id: string,
    titulo: string,
    descripcion: string,
    modulo: PasoFlujo['modulo'],
    orden: number,
    modo: PasoFlujo['modo'],
    requiereIA = false,
    checklist: string[] = [],
    accionesIA: string[] = []
  ): PasoFlujo {
    return {
      id,
      titulo,
      descripcion,
      modulo,
      orden,
      modo,
      requiereIA,
      checklist,
      accionesIA,
      estimacionMinutos: requiereIA ? 15 : 25
    };
  }

  private setAsignaciones(asignaciones: FlujoAsignado[]) {
    this.asignacionesSubject.next(asignaciones);
    try {
      localStorage.setItem(this.STORAGE_ASSIGNMENTS, JSON.stringify(asignaciones));
    } catch (error) {
      console.error('Error saving workflow assignments', error);
    }
  }

  private loadFromStorage<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error('Error loading workflow data', error);
      return null;
    }
  }

  private setFlujos(flujos: FlujoTrabajo[]) {
    this.flujosSubject.next(flujos);
    try {
      localStorage.setItem(this.STORAGE_FLOWS, JSON.stringify(flujos));
    } catch (error) {
      console.error('Error saving workflow flows', error);
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  }
}
