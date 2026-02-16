import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Paciente, RegistroNutricional, SeguimientoMensual, PautaNutricional } from '../models/nutricion.models';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private pacientesSubject = new BehaviorSubject<Paciente[]>([]);
  private registrosSubject = new BehaviorSubject<RegistroNutricional[]>([]);
  private seguimientosSubject = new BehaviorSubject<SeguimientoMensual[]>([]);
  private pautasSubject = new BehaviorSubject<PautaNutricional[]>([]);

  public pacientes$ = this.pacientesSubject.asObservable();
  public registros$ = this.registrosSubject.asObservable();
  public seguimientos$ = this.seguimientosSubject.asObservable();
  public pautas$ = this.pautasSubject.asObservable();

  constructor() {
    this.initializeData();
  }

  private initializeData() {
    // Cargar datos del localStorage o crear datos fake si no existen
    const pacientes = this.loadFromStorage<Paciente[]>('pacientes');
    const registros = this.loadFromStorage<RegistroNutricional[]>('registros');
    const seguimientos = this.loadFromStorage<SeguimientoMensual[]>('seguimientos');
    const pautas = this.loadFromStorage<PautaNutricional[]>('pautas');

    if (!pacientes || pacientes.length === 0) {
      this.createFakeData();
    } else {
      this.pacientesSubject.next(pacientes);
      this.registrosSubject.next(registros || []);
      this.seguimientosSubject.next(seguimientos || []);
      this.pautasSubject.next(pautas || []);
    }
  }

  private persistPacientes(pacientes: Paciente[]): void {
    this.saveToStorage('pacientes', pacientes);
    this.pacientesSubject.next(pacientes);
  }

  private createFakeData() {
    const cohortPatients: Paciente[] = [
      {
        id: 'pac_validacion_01',
        nombre: 'Camila',
        apellido: 'Rojas',
        edad: 37,
        telefono: '+56 9 1010 1122',
        email: 'camila.rojas@demo.com',
        fechaRegistro: new Date(2024, 0, 15),
        activo: true
      },
      {
        id: 'pac_validacion_02',
        nombre: 'Javier',
        apellido: 'Soto',
        edad: 33,
        telefono: '+56 9 3030 4455',
        email: 'javier.soto@demo.com',
        fechaRegistro: new Date(2024, 1, 2),
        activo: true
      },
      {
        id: 'pac_validacion_03',
        nombre: 'Valentina',
        apellido: 'Muñoz',
        edad: 41,
        telefono: '+56 9 5050 6677',
        email: 'valentina.munoz@demo.com',
        fechaRegistro: new Date(2024, 1, 28),
        activo: true
      },
      {
        id: 'pac_validacion_04',
        nombre: 'Tomás',
        apellido: 'Contreras',
        edad: 35,
        telefono: '+56 9 7070 8899',
        email: 'tomas.contreras@demo.com',
        fechaRegistro: new Date(2024, 2, 10),
        activo: true
      },
      {
        id: 'pac_validacion_05',
        nombre: 'María José',
        apellido: 'Silva',
        edad: 39,
        telefono: '+56 9 9090 2244',
        email: 'maria.silva@demo.com',
        fechaRegistro: new Date(2024, 2, 22),
        activo: true
      },
      {
        id: 'pac_validacion_06',
        nombre: 'Felipe',
        apellido: 'Araya',
        edad: 30,
        telefono: '+56 9 6060 7788',
        email: 'felipe.araya@demo.com',
        fechaRegistro: new Date(2024, 3, 6),
        activo: true
      }
    ];

    const pacientesFake: Paciente[] = [
      {
        id: 'pac_manual',
        nombre: 'Lucía',
        apellido: 'Pérez',
        edad: 34,
        telefono: '+56 9 2222 3344',
        email: 'lucia.perez@demo.com',
        fechaRegistro: new Date(2023, 9, 12),
        activo: true
      },
      {
        id: 'pac_ia',
        nombre: 'Diego',
        apellido: 'Torres',
        edad: 29,
        telefono: '+56 9 5555 8899',
        email: 'diego.torres@demo.com',
        fechaRegistro: new Date(2024, 10, 5),
        activo: true
      },
      ...cohortPatients
    ];

    const registrosValidacion: RegistroNutricional[] = [
      {
        id: 'reg_validacion_01',
        pacienteId: 'pac_validacion_01',
        fecha: new Date(2024, 4, 20),
        peso: 72.1,
        altura: 168,
        actividad: 'moderado',
        objetivo: 'perder',
        calorias: 2050,
        proteinas: 115,
        carbohidratos: 240,
        grasas: 68,
        recomendaciones: 'Iteración manual con énfasis en registro detallado.',
        createdWith: 'sin-ia'
      },
      {
        id: 'reg_validacion_02',
        pacienteId: 'pac_validacion_02',
        fecha: new Date(2024, 4, 22),
        peso: 81.3,
        altura: 175,
        actividad: 'ligero',
        objetivo: 'perder',
        calorias: 1900,
        proteinas: 125,
        carbohidratos: 210,
        grasas: 62,
        recomendaciones: 'Iteración asistida por IA con menú autogenerado.',
        createdWith: 'con-ia'
      },
      {
        id: 'reg_validacion_03',
        pacienteId: 'pac_validacion_03',
        fecha: new Date(2024, 4, 25),
        peso: 68.4,
        altura: 160,
        actividad: 'moderado',
        objetivo: 'mantener',
        calorias: 1800,
        proteinas: 105,
        carbohidratos: 210,
        grasas: 58,
        recomendaciones: 'Iteración manual con checklist clínico completo.',
        createdWith: 'sin-ia'
      },
      {
        id: 'reg_validacion_04',
        pacienteId: 'pac_validacion_04',
        fecha: new Date(2024, 4, 27),
        peso: 84.6,
        altura: 180,
        actividad: 'moderado',
        objetivo: 'perder',
        calorias: 2100,
        proteinas: 140,
        carbohidratos: 230,
        grasas: 70,
        recomendaciones: 'Iteración IA prioriza ahorro operativo.',
        createdWith: 'con-ia'
      },
      {
        id: 'reg_validacion_05',
        pacienteId: 'pac_validacion_05',
        fecha: new Date(2024, 4, 29),
        peso: 75.2,
        altura: 170,
        actividad: 'ligero',
        objetivo: 'mantener',
        calorias: 1950,
        proteinas: 118,
        carbohidratos: 215,
        grasas: 65,
        recomendaciones: 'Iteración manual enfocada en adherencia.',
        createdWith: 'sin-ia'
      },
      {
        id: 'reg_validacion_06',
        pacienteId: 'pac_validacion_06',
        fecha: new Date(2024, 5, 2),
        peso: 78.9,
        altura: 176,
        actividad: 'moderado',
        objetivo: 'perder',
        calorias: 2000,
        proteinas: 130,
        carbohidratos: 220,
        grasas: 62,
        recomendaciones: 'Iteración IA con confirmación profesional.',
        createdWith: 'con-ia'
      }
    ];

    const registrosFake: RegistroNutricional[] = [
      {
        id: 'reg_manual_1',
        pacienteId: 'pac_manual',
        fecha: new Date(2024, 4, 10),
        peso: 69.2,
        altura: 165,
        actividad: 'moderado',
        objetivo: 'perder',
        calorias: 1950,
        proteinas: 110,
        carbohidratos: 220,
        grasas: 60,
        recomendaciones: 'Plan manual previo centrado en déficit moderado.',
        createdWith: 'sin-ia'
      },
      {
        id: 'reg_manual_2',
        pacienteId: 'pac_manual',
        fecha: new Date(2024, 6, 7),
        peso: 67.8,
        altura: 165,
        actividad: 'moderado',
        objetivo: 'mantener',
        calorias: 1850,
        proteinas: 115,
        carbohidratos: 200,
        grasas: 58,
        recomendaciones: 'Ajuste manual posterior a la fase inicial.',
        createdWith: 'sin-ia'
      },
      {
        id: 'reg_manual_3',
        pacienteId: 'pac_manual',
        fecha: new Date(2024, 8, 2),
        peso: 66.9,
        altura: 165,
        actividad: 'moderado',
        objetivo: 'mantener',
        calorias: 1820,
        proteinas: 118,
        carbohidratos: 198,
        grasas: 55,
        recomendaciones: 'Seguimiento manual previo a la validación comparativa.',
        createdWith: 'sin-ia'
      },
      ...registrosValidacion
    ];

    const seguimientosFake: SeguimientoMensual[] = [
      {
        id: 'seg_manual_1',
        pacienteId: 'pac_manual',
        mes: 5,
        año: 2024,
        pesoInicial: 69.2,
        pesoFinal: 68.3,
        cumplimientoDieta: 78,
        cumplimientoEjercicio: 70,
        satisfaccion: 4,
        observaciones: 'Adherencia adecuada pero requiere apoyo extra en cenas.',
        fecha: new Date(2024, 5, 30)
      },
      {
        id: 'seg_manual_2',
        pacienteId: 'pac_manual',
        mes: 7,
        año: 2024,
        pesoInicial: 67.8,
        pesoFinal: 67.2,
        cumplimientoDieta: 82,
        cumplimientoEjercicio: 76,
        satisfaccion: 4,
        observaciones: 'Progreso sostenido pero el proceso manual insume más tiempo.',
        fecha: new Date(2024, 7, 28)
      }
    ];

    const pautaMenuObjetivo = [
      'Desayuno: Tostadas integrales con palta, tomate y huevos pochados',
      'Media mañana: Yogur griego con frutos rojos y semillas',
      'Almuerzo: Salmón a la plancha con quinoa y ensalada verde',
      'Once: Smoothie de espinaca, plátano y proteína vegetal',
      'Cena: Pechuga de pollo con vegetales asados y hummus'
    ];

    const pautasFake: PautaNutricional[] = [
      {
        id: 'pauta_manual_1',
        pacienteId: 'pac_manual',
        fecha: new Date(2024, 7, 1),
        calorias: 1850,
        proteinas: 120,
        carbohidratos: 195,
        grasas: 62,
        recomendaciones: 'Propuesta manual previa. Objetivo: consolidar recomposición corporal.',
        menu: pautaMenuObjetivo,
        createdWith: 'sin-ia',
        basadoEnHistorial: true
      }
    ];

    // Guardar en localStorage y actualizar subjects
    this.persistPacientes(pacientesFake);
    this.saveToStorage('registros', registrosFake);
    this.saveToStorage('seguimientos', seguimientosFake);
    this.saveToStorage('pautas', pautasFake);

    this.registrosSubject.next(registrosFake);
    this.seguimientosSubject.next(seguimientosFake);
    this.pautasSubject.next(pautasFake);
  }

  resetToSeedData(): void {
    this.createFakeData();
  }

  // Métodos para gestionar pacientes
  getPacientes(): Paciente[] {
    return this.pacientesSubject.value;
  }

  getPacienteById(id: string): Paciente | undefined {
    return this.pacientesSubject.value.find(p => p.id === id);
  }

  addPaciente(paciente: Omit<Paciente, 'id' | 'fechaRegistro'>): Paciente {
    const nuevoPaciente: Paciente = {
      ...paciente,
      id: this.generateId(),
      fechaRegistro: new Date(),
      historialFlujos: [],
      flujoActivoId: undefined
    };
    
    const pacientes = [...this.pacientesSubject.value, nuevoPaciente];
    this.persistPacientes(pacientes);
    
    return nuevoPaciente;
  }

  updatePaciente(id: string, updates: Partial<Paciente>): void {
    const pacientes = this.pacientesSubject.value.map(p => 
      p.id === id ? { ...p, ...updates } : p
    );
    this.persistPacientes(pacientes);
  }

  registrarAsignacionPaciente(
    pacienteId: string,
    flujoId: string,
    responsable: string,
    fechaAsignacion: string,
    notas?: string
  ): void {
    let updated = false;
    const pacientes = this.pacientesSubject.value.map(paciente => {
      if (paciente.id !== pacienteId) {
        return paciente;
      }
      updated = true;
      const historial = paciente.historialFlujos ?? [];
      const historialActualizado = historial.includes(flujoId)
        ? historial
        : [...historial, flujoId];
      return {
        ...paciente,
        flujoActivoId: flujoId,
        historialFlujos: historialActualizado,
        fechaUltimaAsignacion: fechaAsignacion,
        ultimoFlujoAsignadoPor: responsable,
        notasUltimaAsignacion: notas ?? paciente.notasUltimaAsignacion
      };
    });

    if (updated) {
      this.persistPacientes(pacientes);
    }
  }

  marcarFlujoCompletado(pacienteId: string, flujoId: string): void {
    let updated = false;
    const pacientes = this.pacientesSubject.value.map(paciente => {
      if (paciente.id !== pacienteId || paciente.flujoActivoId !== flujoId) {
        return paciente;
      }
      updated = true;
      return { ...paciente, flujoActivoId: undefined };
    });

    if (updated) {
      this.persistPacientes(pacientes);
    }
  }

  // Métodos para gestionar registros nutricionales
  getRegistrosByPaciente(pacienteId: string): RegistroNutricional[] {
    return this.registrosSubject.value
      .filter(r => r.pacienteId === pacienteId)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }

  addRegistro(registro: Omit<RegistroNutricional, 'id'>): RegistroNutricional {
    const nuevoRegistro: RegistroNutricional = {
      ...registro,
      id: this.generateId()
    };
    
    const registros = [...this.registrosSubject.value, nuevoRegistro];
    this.saveToStorage('registros', registros);
    this.registrosSubject.next(registros);
    
    return nuevoRegistro;
  }

  // Métodos para gestionar seguimientos
  getSeguimientosByPaciente(pacienteId: string): SeguimientoMensual[] {
    return this.seguimientosSubject.value
      .filter(s => s.pacienteId === pacienteId)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }

  addSeguimiento(seguimiento: Omit<SeguimientoMensual, 'id'>): SeguimientoMensual {
    const nuevoSeguimiento: SeguimientoMensual = {
      ...seguimiento,
      id: this.generateId()
    };
    
    const seguimientos = [...this.seguimientosSubject.value, nuevoSeguimiento];
    this.saveToStorage('seguimientos', seguimientos);
    this.seguimientosSubject.next(seguimientos);
    
    return nuevoSeguimiento;
  }

  // Métodos para gestionar pautas
  getPautasByPaciente(pacienteId: string): PautaNutricional[] {
    return this.pautasSubject.value
      .filter(p => p.pacienteId === pacienteId)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }

  addPauta(pauta: Omit<PautaNutricional, 'id'>): PautaNutricional {
    const nuevaPauta: PautaNutricional = {
      ...pauta,
      id: this.generateId()
    };
    
    const pautas = [...this.pautasSubject.value, nuevaPauta];
    this.saveToStorage('pautas', pautas);
    this.pautasSubject.next(pautas);
    
    return nuevaPauta;
  }

  // Método para generar sugerencias con IA basadas en historial
  generarSugerenciaIA(pacienteId: string): string {
    const registros = this.getRegistrosByPaciente(pacienteId);
    const seguimientos = this.getSeguimientosByPaciente(pacienteId);
    
    if (registros.length === 0) {
      return 'Sin historial suficiente para generar sugerencias personalizadas.';
    }

    const ultimoRegistro = registros[0];
    const penultimoRegistro = registros[1];
    const promedioSatisfaccion = seguimientos.length > 0 
      ? seguimientos.reduce((sum, s) => sum + s.satisfaccion, 0) / seguimientos.length 
      : 3;

    let sugerencias = '🤖 ANÁLISIS CON IA - SUGERENCIAS PERSONALIZADAS:\n\n';

    // Análisis de tendencia de peso
    if (penultimoRegistro) {
      const diferenciaPeso = ultimoRegistro.peso - penultimoRegistro.peso;
      if (diferenciaPeso > 0.5) {
        sugerencias += '⚠️ TENDENCIA: Aumento de peso detectado (+' + diferenciaPeso.toFixed(1) + 'kg)\n';
        sugerencias += '   → Reducir calorías en 200kcal\n';
        sugerencias += '   → Incrementar actividad cardiovascular\n\n';
      } else if (diferenciaPeso < -0.5) {
        sugerencias += '✅ TENDENCIA: Pérdida de peso exitosa (-' + Math.abs(diferenciaPeso).toFixed(1) + 'kg)\n';
        sugerencias += '   → Mantener plan actual\n';
        sugerencias += '   → Monitorear para evitar pérdida excesiva\n\n';
      }
    }

    // Análisis de satisfacción
    if (promedioSatisfaccion < 3) {
      sugerencias += '📊 SATISFACCIÓN BAJA: Promedio ' + promedioSatisfaccion.toFixed(1) + '/5\n';
      sugerencias += '   → Revisar variedad en el menú\n';
      sugerencias += '   → Considerar alimentos preferidos del paciente\n';
      sugerencias += '   → Ajustar porciones para mayor saciedad\n\n';
    }

    // Recomendaciones específicas basadas en objetivo
    if (ultimoRegistro.objetivo === 'perder') {
      sugerencias += '🎯 OPTIMIZACIÓN PARA PÉRDIDA DE PESO:\n';
      sugerencias += '   → Aumentar proteínas a ' + Math.round(ultimoRegistro.proteinas * 1.2) + 'g\n';
      sugerencias += '   → Reducir carbohidratos a ' + Math.round(ultimoRegistro.carbohidratos * 0.8) + 'g\n';
      sugerencias += '   → Incluir ayuno intermitente 16:8\n\n';
    }

    // Sugerencias de menú inteligente
    sugerencias += '🍽️ MENÚ SUGERIDO POR IA:\n';
    sugerencias += '   → Desayuno: Huevos revueltos con espinacas y palta\n';
    sugerencias += '   → Colación: Yogur griego con berries\n';
    sugerencias += '   → Almuerzo: Salmón con quinoa y brócoli\n';
    sugerencias += '   → Once: Té verde con almendras\n';
    sugerencias += '   → Cena: Pechuga de pollo con ensalada mediterránea\n\n';

    sugerencias += '📈 PREDICCIÓN IA: Con estos ajustes, se espera una pérdida de 0.5-0.7kg en las próximas 2 semanas.';

    return sugerencias;
  }

  // Métodos auxiliares
  private loadFromStorage<T>(key: string): T | null {
    try {
      const data = localStorage.getItem(`nutricion_${key}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Error loading ${key} from localStorage:`, error);
      return null;
    }
  }

  private saveToStorage<T>(key: string, data: T): void {
    try {
      localStorage.setItem(`nutricion_${key}`, JSON.stringify(data));
    } catch (error) {
      console.error(`Error saving ${key} to localStorage:`, error);
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Método para limpiar todos los datos (útil para desarrollo)
  clearAllData(): void {
    localStorage.removeItem('nutricion_pacientes');
    localStorage.removeItem('nutricion_registros');
    localStorage.removeItem('nutricion_seguimientos');
    localStorage.removeItem('nutricion_pautas');
    this.createFakeData();
  }
}
