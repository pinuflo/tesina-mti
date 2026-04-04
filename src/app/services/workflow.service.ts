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
  interacciones?: number;
  iaSugerencias?: number;
  iaAceptadas?: number;
  iaCorregidas?: number;
}

interface AssignOptions {
  ordenValidacion?: OrdenValidacion;
  iteracionEtiqueta?: string;
  fechaAsignacion?: string;
  responsable?: string;
  notas?: string;
  forceReassign?: boolean;
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
  responsable?: string;
  notas?: string;
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

  createFlujo(flujo: FlujoTrabajo): FlujoTrabajo {
    const normalizado = this.normalizeFlujoData(flujo);
    const flujos = [...this.flujosSubject.value, normalizado];
    this.setFlujos(flujos);
    return normalizado;
  }

  saveFlujo(flujo: FlujoTrabajo): FlujoTrabajo {
    if (!flujo.id || flujo.id.trim().length === 0) {
      return this.createFlujo(flujo);
    }
    const normalizado = this.normalizeFlujoData(flujo, flujo.id);
    const flujos = [...this.flujosSubject.value];
    const index = flujos.findIndex(f => f.id === normalizado.id);
    if (index === -1) {
      flujos.push(normalizado);
    } else {
      flujos[index] = normalizado;
    }
    this.setFlujos(flujos);
    return normalizado;
  }

  deleteFlujo(flujoId: string): boolean {
    const enUso = this.asignacionesSubject.value.some(asignacion => asignacion.flujoId === flujoId);
    if (enUso) {
      return false;
    }
    const flujos = this.flujosSubject.value.filter(f => f.id !== flujoId);
    if (flujos.length === this.flujosSubject.value.length) {
      return false;
    }
    this.setFlujos(flujos);
    return true;
  }

  duplicateFlujo(flujoId: string): FlujoTrabajo | null {
    const original = this.getFlujoById(flujoId);
    if (!original) {
      return null;
    }

    const copia: FlujoTrabajo = {
      ...original,
      id: '',
      nombre: `${original.nombre} (copia)`,
      activo: false,
      pasos: original.pasos.map(paso => ({
        ...paso,
        id: ''
      })),
      objetivos: [...original.objetivos],
      objetivoFinal: original.objetivoFinal
        ? {
            ...original.objetivoFinal,
            menuSugerido: [...(original.objetivoFinal.menuSugerido ?? [])]
          }
        : undefined
    };

    return this.createFlujo(copia);
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
    let asignaciones = [...this.asignacionesSubject.value];
    const indexExistente = asignaciones.findIndex(a => a.pacienteId === pacienteId && a.estado !== 'completado');
    if (indexExistente !== -1) {
      const existente = asignaciones[indexExistente];
      if (!options.forceReassign) {
        return existente;
      }
      asignaciones.splice(indexExistente, 1);
      this.dataService.marcarFlujoCompletado(pacienteId, existente.flujoId);
    }

    const flujo = this.getFlujoById(flujoId);
    if (!flujo) {
      throw new Error(`No se encontró la plantilla ${flujoId}`);
    }

    const responsable = options.responsable ?? 'Sistema de validación';
    const fechaAsignacion = options.fechaAsignacion ?? new Date().toISOString();
    const nuevaAsignacion: FlujoAsignado = {
      id: this.generateId(),
      pacienteId,
      flujoId,
      modoEjecutado: modo,
      fechaAsignacion,
      estado: 'pendiente',
      pasoActualId: null,
      ejecucion: [],
      objetivoFinal: flujo?.objetivoFinal,
      iteracionEtiqueta: options.iteracionEtiqueta,
      ordenValidacion: options.ordenValidacion,
      responsableAsignacion: responsable,
      notasAsignacion: options.notas
    };

    asignaciones = [...asignaciones, nuevaAsignacion];
    this.setAsignaciones(asignaciones);
    this.dataService.registrarAsignacionPaciente(
      pacienteId,
      flujoId,
      responsable,
      fechaAsignacion,
      options.notas
    );
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
    let paso = asignacion.ejecucion.find(e => e.pasoId === pasoId);
    if (!paso) {
      this.startPaso(asignacionId, pasoId);
      const refreshed = this.getAsignaciones().find(a => a.id === asignacionId);
      if (!refreshed) {
        return null;
      }
      const refreshedPaso = refreshed.ejecucion.find(e => e.pasoId === pasoId);
      if (!refreshedPaso) {
        return null;
      }
      asignacion.ejecucion = [...refreshed.ejecucion];
      asignacion.pasoActualId = refreshed.pasoActualId;
      asignacion.estado = refreshed.estado;
      paso = refreshedPaso;
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
      paso.interacciones = payload.interacciones;
      paso.iaSugerencias = payload.iaSugerencias;
      paso.iaAceptadas = payload.iaAceptadas;
      paso.iaCorregidas = payload.iaCorregidas;
      this.logService.completeStep(paso.logId, {
        facilidad: payload.facilidad,
        comentario: payload.comentarios,
        camposAutocompletados: payload.camposAutocompletados,
        camposManuales: payload.camposManuales,
        tiempoMinutos: diffMin,
        interacciones: payload.interacciones,
        iaSugerencias: payload.iaSugerencias,
        iaAceptadas: payload.iaAceptadas,
        iaCorregidas: payload.iaCorregidas
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
          asignacion.resultado = this.calcularResultado(asignacion, flujo);
        this.dataService.marcarFlujoCompletado(asignacion.pacienteId, asignacion.flujoId);
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

  private calcularResultado(asignacion: FlujoAsignado, flujo?: FlujoTrabajo): FlujoResultado {
    const tiempos = asignacion.ejecucion.map(e => e.tiempoMinutos || 0);
    const facilidades = asignacion.ejecucion
      .filter(e => typeof e.facilidad === 'number')
      .map(e => e.facilidad as number);
    const camposAutocompletadosTotal = asignacion.ejecucion.reduce(
      (sum, paso) => sum + (paso.camposAutocompletados || 0),
      0
    );
    const camposManualesTotal = asignacion.ejecucion.reduce(
      (sum, paso) => sum + (paso.camposManuales || 0),
      0
    );
    const pasosCompletados = asignacion.ejecucion.filter(e => e.fin).length;
    const totalPasos = flujo?.pasos.length ?? asignacion.ejecucion.length;
    const interaccionesTotal = asignacion.ejecucion.reduce(
      (sum, paso) => sum + (paso.interacciones || 0),
      0
    );
    const iaSugerenciasTotal = asignacion.ejecucion.reduce(
      (sum, paso) => sum + (paso.iaSugerencias || 0),
      0
    );
    const iaAceptadasTotal = asignacion.ejecucion.reduce(
      (sum, paso) => sum + (paso.iaAceptadas || 0),
      0
    );
    const iaCorregidasTotal = asignacion.ejecucion.reduce(
      (sum, paso) => sum + (paso.iaCorregidas || 0),
      0
    );
    const menuRealSugerido = asignacion.ejecucion.some(e =>
      !!e.fin && (e.pasoId === 'evaluacion_3' || e.pasoId === 'evaluacion_ia_3')
    );

    const tiempoTotalMin = tiempos.reduce((sum, val) => sum + val, 0);
    const facilidadPromedio = facilidades.length > 0
      ? facilidades.reduce((sum, val) => sum + val, 0) / facilidades.length
      : undefined;

    return {
      tiempoTotalMin,
      facilidadPromedio,
      camposAutocompletadosTotal,
      camposManualesTotal,
      pasosCompletados,
      totalPasos,
      menuRealSugerido,
      interaccionesTotal,
      iaSugerenciasTotal,
      iaAceptadasTotal,
      iaCorregidasTotal
    };
  }

  private loadData() {
    const flujos = this.loadFromStorage<FlujoTrabajo[]>(this.STORAGE_FLOWS);
    const asignaciones = this.loadFromStorage<FlujoAsignado[]>(this.STORAGE_ASSIGNMENTS);

    if (flujos && flujos.length > 0) {
      const reconciliados = this.reconcileDefaultFlows(flujos);
      if (reconciliados !== flujos) {
        this.setFlujos(reconciliados);
      } else {
        this.flujosSubject.next(reconciliados);
      }
    } else {
      this.setFlujos(this.getDefaultFlows());
    }

    this.asignacionesSubject.next(asignaciones || []);
  }

  private getDefaultFlows(): FlujoTrabajo[] {
    const flujoManual: FlujoTrabajo = {
      id: 'flujo_manual_sin_ia',
      nombre: 'Protocolo Manual (Sin IA)',
      descripcion: 'Flujo de pauta manual con cierre en cuatro fases.',
      modoObjetivo: 'sin-ia',
      tiempoEstimadoMin: 95,
      objetivos: [
        'Registrar ficha clínica completa',
        'Calcular requerimientos energéticos',
        'Definir macros diarios por objetivo',
        'Cerrar pauta semanal validada'
      ],
      activo: true,
      objetivoFinal: this.getObjetivoComun(),
      pasos: [
        this.createPaso('pacientes_1', 'Registrar paciente y hábitos', 'Completar ficha y recordatorio de 24h.', 'pacientes', 1, 'sin-ia', false, [
          'Completar datos personales',
          'Registrar hábitos y recordatorio 24h',
          'Adjuntar notas clínicas'
        ]),
        this.createPaso('evaluacion_1', 'Calcular requerimientos energéticos', 'Definir TMB y calorías objetivo del paciente.', 'evaluacion', 2, 'sin-ia', false, [
          'Calcular TMB con fórmula Harris-Benedict',
          'Determinar calorías objetivo',
          'Validar coherencia clínica de calorías objetivo'
        ]),
        this.createPaso('evaluacion_2', 'Definir macros diarios', 'Ajustar proteínas, carbohidratos y grasas diarias.', 'evaluacion', 3, 'sin-ia', false, [
          'Definir proteínas diarias por objetivo clínico',
          'Ajustar carbohidratos y grasas diarias',
          'Validar distribución de macros diarios'
        ]),
        this.createPaso('evaluacion_3', 'Sugerir menú real', 'Transformar porciones en platos reales sugeridos.', 'evaluacion', 4, 'sin-ia', false, [
          'Generar sugerencias de menú real por tiempo de comida',
          'Validar consistencia con macros objetivo',
          'Confirmar selección para cierre final'
        ]),
        this.createPaso('evaluacion_4', 'Cerrar pauta semanal', 'Construir y guardar pauta nutricional final.', 'evaluacion', 5, 'sin-ia', false, [
          'Armar pauta semanal por comidas',
          'Validar consistencia con macros objetivo',
          'Guardar pauta y cerrar flujo'
        ])
      ]
    };

    const flujoIA: FlujoTrabajo = {
      id: 'flujo_asistido_ia',
      nombre: 'Protocolo Asistido (Con IA)',
      descripcion: 'Flujo asistido para cierre de pauta en cuatro fases.',
      modoObjetivo: 'con-ia',
      tiempoEstimadoMin: 65,
      objetivos: [
        'Completar ficha clínica con soporte IA',
        'Calcular requerimientos energéticos asistidos',
        'Ajustar macros diarios con soporte IA',
        'Guardar pauta final con apoyo de IA'
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
        this.createPaso('evaluacion_ia_1', 'Calcular requerimientos con IA', 'Generar y validar calorías objetivo asistidas.', 'evaluacion', 2, 'con-ia', true, [
          'Correr simulación IA',
          'Validar TMB y calorías objetivo sugeridas',
          'Ajustar metas energéticas diarias'
        ], [
          'Predecir progreso 4 semanas'
        ]),
        this.createPaso('evaluacion_ia_2', 'Definir macros diarios con IA', 'Ajustar distribución de macros asistida.', 'evaluacion', 3, 'con-ia', true, [
          'Generar propuesta de macros diarios',
          'Ajustar proteínas, carbohidratos y grasas',
          'Validar distribución diaria final'
        ], [
          'Comparar macrodistribución sugerida vs manual'
        ]),
        this.createPaso('evaluacion_ia_3', 'Sugerir menú real con IA', 'Transformar porciones en platos reales sugeridos con soporte IA.', 'evaluacion', 4, 'con-ia', true, [
          'Generar menú real sugerido por tiempo de comida',
          'Validar consistencia con macros objetivo',
          'Confirmar selección para cierre final'
        ], [
          'Ranking de platos por afinidad de macros',
          'Ajustes automáticos por preferencia del paciente'
        ]),
        this.createPaso('evaluacion_ia_4', 'Cerrar pauta semanal asistida', 'Guardar pauta final con soporte de IA.', 'evaluacion', 5, 'con-ia', true, [
          'Armar pauta semanal sugerida',
          'Revisar menú final por comidas',
          'Guardar pauta y cerrar flujo'
        ], [
          'Sugerir menú real automáticamente',
          'Generar recomendaciones personalizadas'
        ])
      ]
    };

    return [flujoManual, flujoIA];
  }

  private reconcileDefaultFlows(flujos: FlujoTrabajo[]): FlujoTrabajo[] {
    const defaults = this.getDefaultFlows();
    const requiredSteps: Record<string, string[]> = {
      flujo_manual_sin_ia: ['pacientes_1', 'evaluacion_1', 'evaluacion_2', 'evaluacion_3', 'evaluacion_4'],
      flujo_asistido_ia: ['pacientes_ia_1', 'evaluacion_ia_1', 'evaluacion_ia_2', 'evaluacion_ia_3', 'evaluacion_ia_4']
    };

    let changed = false;
    const reconciled = [...flujos];

    defaults.forEach(defaultFlow => {
      const idx = reconciled.findIndex(f => f.id === defaultFlow.id);
      if (idx === -1) {
        reconciled.push(defaultFlow);
        changed = true;
        return;
      }

      const existing = reconciled[idx];
      const required = requiredSteps[defaultFlow.id] || [];
      const hasAllRequired = required.every(stepId => existing.pasos.some(p => p.id === stepId));
      if (!hasAllRequired) {
        reconciled[idx] = defaultFlow;
        changed = true;
      }
    });

    return changed ? reconciled : flujos;
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
          ordenValidacion: escenario.ordenValidacion,
          responsable: escenario.responsable ?? 'Semilla automática',
          notas: escenario.notas ?? 'Asignación precargada para validar flujos.'
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

  private normalizeFlujoData(flujo: FlujoTrabajo, forcedId?: string): FlujoTrabajo {
    const flujoId = forcedId ?? (flujo.id && flujo.id.trim().length > 0 ? flujo.id : this.generateId());
    const pasosOrdenados = (flujo.pasos ?? [])
      .map((paso, index) => {
        const pasoId = paso.id && paso.id.trim().length > 0
          ? paso.id
          : `${flujoId}_paso_${index + 1}_${this.generateId()}`;
        return {
          ...paso,
          id: pasoId,
          checklist: [...(paso.checklist ?? [])],
          accionesIA: paso.requiereIA ? [...(paso.accionesIA ?? [])] : [],
          orden: paso.orden ?? index + 1
        };
      })
      .sort((a, b) => a.orden - b.orden)
      .map((paso, index) => ({ ...paso, orden: index + 1 }));

    const objetivos = (flujo.objetivos ?? [])
      .map(o => o.trim())
      .filter(obj => obj.length > 0);

    const objetivoFinal = flujo.objetivoFinal
      ? {
          ...flujo.objetivoFinal,
          menuSugerido: [...(flujo.objetivoFinal.menuSugerido ?? [])]
        }
      : undefined;

    return {
      ...flujo,
      id: flujoId,
      nombre: flujo.nombre.trim(),
      descripcion: flujo.descripcion.trim(),
      objetivos,
      pasos: pasosOrdenados,
      tiempoEstimadoMin: flujo.tiempoEstimadoMin ?? pasosOrdenados.length * 20,
      objetivoFinal
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
