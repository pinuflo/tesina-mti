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

  private createFakeData() {
    const now = new Date();
    
    // Crear pacientes fake
    const pacientesFake: Paciente[] = [
      {
        id: '1',
        nombre: 'María',
        apellido: 'González',
        edad: 32,
        telefono: '+56 9 8765 4321',
        email: 'maria.gonzalez@email.com',
        fechaRegistro: new Date(2024, 0, 15),
        activo: true
      },
      {
        id: '2',
        nombre: 'Carlos',
        apellido: 'Mendoza',
        edad: 45,
        telefono: '+56 9 1234 5678',
        email: 'carlos.mendoza@email.com',
        fechaRegistro: new Date(2024, 1, 20),
        activo: true
      },
      {
        id: '3',
        nombre: 'Ana',
        apellido: 'Silva',
        edad: 28,
        telefono: '+56 9 9876 5432',
        email: 'ana.silva@email.com',
        fechaRegistro: new Date(2024, 2, 10),
        activo: true
      },
      {
        id: '4',
        nombre: 'Roberto',
        apellido: 'Fernández',
        edad: 38,
        telefono: '+56 9 5555 1234',
        email: 'roberto.fernandez@email.com',
        fechaRegistro: new Date(2024, 3, 5),
        activo: false
      }
    ];

    // Crear historial nutricional fake
    const registrosFake: RegistroNutricional[] = [];
    const seguimientosFake: SeguimientoMensual[] = [];
    const pautasFake: PautaNutricional[] = [];

    pacientesFake.forEach(paciente => {
      // Crear 6 meses de historial para cada paciente
      for (let i = 0; i < 6; i++) {
        const fecha = new Date(2024, i + 2, 15);
        const pesoBase = paciente.id === '1' ? 68 : paciente.id === '2' ? 85 : paciente.id === '3' ? 62 : 92;
        const pesoVariacion = Math.random() * 4 - 2; // -2 a +2 kg
        
        // Registro nutricional
        const registro: RegistroNutricional = {
          id: `reg_${paciente.id}_${i}`,
          pacienteId: paciente.id,
          fecha: fecha,
          peso: pesoBase + pesoVariacion,
          altura: paciente.id === '1' ? 165 : paciente.id === '2' ? 178 : paciente.id === '3' ? 160 : 175,
          actividad: ['sedentario', 'ligero', 'moderado'][Math.floor(Math.random() * 3)] as any,
          objetivo: ['perder', 'mantener', 'ganar'][Math.floor(Math.random() * 3)] as any,
          calorias: 1800 + Math.floor(Math.random() * 600),
          proteinas: 100 + Math.floor(Math.random() * 50),
          carbohidratos: 200 + Math.floor(Math.random() * 100),
          grasas: 60 + Math.floor(Math.random() * 30),
          recomendaciones: 'Recomendaciones generales basadas en evaluación',
          createdWith: Math.random() > 0.5 ? 'con-ia' : 'sin-ia'
        };
        registrosFake.push(registro);

        // Seguimiento mensual
        const seguimiento: SeguimientoMensual = {
          id: `seg_${paciente.id}_${i}`,
          pacienteId: paciente.id,
          mes: fecha.getMonth() + 1,
          año: fecha.getFullYear(),
          pesoInicial: pesoBase + pesoVariacion,
          pesoFinal: pesoBase + pesoVariacion + (Math.random() * 2 - 1),
          cumplimientoDieta: 60 + Math.floor(Math.random() * 40),
          cumplimientoEjercicio: 50 + Math.floor(Math.random() * 50),
          satisfaccion: 3 + Math.floor(Math.random() * 3),
          observaciones: 'Progreso satisfactorio. Paciente comprometido con el tratamiento.',
          fecha: fecha
        };
        seguimientosFake.push(seguimiento);

        // Pauta nutricional
        const pauta: PautaNutricional = {
          id: `pauta_${paciente.id}_${i}`,
          pacienteId: paciente.id,
          fecha: fecha,
          calorias: registro.calorias,
          proteinas: registro.proteinas,
          carbohidratos: registro.carbohidratos,
          grasas: registro.grasas,
          recomendaciones: `Pauta personalizada para ${paciente.nombre}. Enfoque en ${registro.objetivo} peso.`,
          menu: [
            'Desayuno: Avena con frutas y frutos secos',
            'Media mañana: Yogur natural con almendras',
            'Almuerzo: Pollo grillado con ensalada mixta',
            'Once: Té con tostadas integrales',
            'Cena: Pescado al horno con verduras'
          ],
          createdWith: registro.createdWith,
          basadoEnHistorial: i > 0
        };
        pautasFake.push(pauta);
      }
    });

    // Guardar en localStorage y actualizar subjects
    this.saveToStorage('pacientes', pacientesFake);
    this.saveToStorage('registros', registrosFake);
    this.saveToStorage('seguimientos', seguimientosFake);
    this.saveToStorage('pautas', pautasFake);

    this.pacientesSubject.next(pacientesFake);
    this.registrosSubject.next(registrosFake);
    this.seguimientosSubject.next(seguimientosFake);
    this.pautasSubject.next(pautasFake);
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
      fechaRegistro: new Date()
    };
    
    const pacientes = [...this.pacientesSubject.value, nuevoPaciente];
    this.saveToStorage('pacientes', pacientes);
    this.pacientesSubject.next(pacientes);
    
    return nuevoPaciente;
  }

  updatePaciente(id: string, updates: Partial<Paciente>): void {
    const pacientes = this.pacientesSubject.value.map(p => 
      p.id === id ? { ...p, ...updates } : p
    );
    this.saveToStorage('pacientes', pacientes);
    this.pacientesSubject.next(pacientes);
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
