export interface Paciente {
  id: string;
  nombre: string;
  apellido: string;
  edad: number;
  telefono: string;
  email: string;
  fechaRegistro: Date;
  activo: boolean;
}

export interface RegistroNutricional {
  id: string;
  pacienteId: string;
  fecha: Date;
  peso: number;
  altura: number;
  actividad: 'sedentario' | 'ligero' | 'moderado' | 'intenso';
  objetivo: 'perder' | 'mantener' | 'ganar';
  calorias: number;
  proteinas: number;
  carbohidratos: number;
  grasas: number;
  recomendaciones: string;
  observaciones?: string;
  createdWith: 'sin-ia' | 'con-ia';
}

export interface SeguimientoMensual {
  id: string;
  pacienteId: string;
  mes: number;
  año: number;
  pesoInicial: number;
  pesoFinal: number;
  cumplimientoDieta: number; // 0-100%
  cumplimientoEjercicio: number; // 0-100%
  satisfaccion: number; // 1-5
  observaciones: string;
  fecha: Date;
}

export interface PautaNutricional {
  id: string;
  pacienteId: string;
  fecha: Date;
  calorias: number;
  proteinas: number;
  carbohidratos: number;
  grasas: number;
  recomendaciones: string;
  menu?: string[];
  observaciones?: string;
  createdWith: 'sin-ia' | 'con-ia';
  basadoEnHistorial?: boolean;
}
