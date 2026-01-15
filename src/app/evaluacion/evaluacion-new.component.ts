import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { VersionService } from '../services/version.service';
import { DataService } from '../services/data.service';
import { Paciente, PautaNutricional } from '../models/nutricion.models';

@Component({
  selector: 'app-evaluacion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './evaluacion.component.html',
  styleUrl: './evaluacion.component.scss'
})
export class EvaluacionComponent implements OnInit {
  isAIEnabled = false;
  pacienteSeleccionado: Paciente | null = null;
  pacientes: Paciente[] = [];
  
  // Datos del paciente
  paciente = {
    id: '',
    nombre: '',
    edad: '',
    peso: '',
    altura: '',
    actividad: 'sedentario',
    objetivo: 'mantener'
  };

  // Pauta nutricional
  pautaNutricional = {
    calorias: 0,
    proteinas: 0,
    carbohidratos: 0,
    grasas: 0,
    recomendaciones: ''
  };

  constructor(
    private versionService: VersionService,
    private dataService: DataService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.versionService.version$.subscribe(version => {
      this.isAIEnabled = this.versionService.isAIEnabled();
    });

    this.dataService.pacientes$.subscribe(pacientes => {
      this.pacientes = pacientes.filter(p => p.activo);
    });

    // Verificar si viene un paciente específico desde la URL
    this.route.queryParams.subscribe(params => {
      if (params['pacienteId']) {
        const paciente = this.dataService.getPacienteById(params['pacienteId']);
        if (paciente) {
          this.seleccionarPaciente(paciente);
        }
      }
    });
  }

  seleccionarPaciente(paciente: Paciente) {
    this.pacienteSeleccionado = paciente;
    this.paciente.id = paciente.id;
    this.paciente.nombre = `${paciente.nombre} ${paciente.apellido}`;
    
    // Si tiene historial, cargar datos del último registro
    const ultimoRegistro = this.dataService.getRegistrosByPaciente(paciente.id)[0];
    if (ultimoRegistro) {
      this.paciente.peso = ultimoRegistro.peso.toString();
      this.paciente.altura = ultimoRegistro.altura.toString();
      this.paciente.actividad = ultimoRegistro.actividad;
      this.paciente.objetivo = ultimoRegistro.objetivo;
    }
  }

  calcularPauta() {
    if (!this.paciente.peso || !this.paciente.altura || !this.pacienteSeleccionado) {
      alert('Por favor complete todos los campos del paciente y seleccione un paciente');
      return;
    }

    // Cálculo básico de TMB (Tasa Metabólica Basal)
    const peso = parseFloat(this.paciente.peso);
    const altura = parseFloat(this.paciente.altura);
    const edad = this.pacienteSeleccionado.edad;
    
    // Fórmula de Harris-Benedict (aproximada)
    let tmb = 88.362 + (13.397 * peso) + (4.799 * altura) - (5.677 * edad);
    
    // Factor de actividad
    const factorActividad = {
      'sedentario': 1.2,
      'ligero': 1.375,
      'moderado': 1.55,
      'intenso': 1.725
    };
    
    let calorias = tmb * factorActividad[this.paciente.actividad as keyof typeof factorActividad];
    
    // Ajustar según objetivo
    if (this.paciente.objetivo === 'perder') {
      calorias -= 500;
    } else if (this.paciente.objetivo === 'ganar') {
      calorias += 500;
    }
    
    // Distribución de macronutrientes
    this.pautaNutricional = {
      calorias: Math.round(calorias),
      proteinas: Math.round((calorias * 0.25) / 4), // 25% proteínas
      carbohidratos: Math.round((calorias * 0.45) / 4), // 45% carbohidratos
      grasas: Math.round((calorias * 0.30) / 9), // 30% grasas
      recomendaciones: this.isAIEnabled ? this.generarRecomendacionesIA() : this.generarRecomendacionesBasicas()
    };
  }

  guardarPauta() {
    if (this.pautaNutricional.calorias === 0 || !this.pacienteSeleccionado) {
      alert('Primero debe calcular la pauta nutricional');
      return;
    }

    // Guardar registro nutricional
    this.dataService.addRegistro({
      pacienteId: this.pacienteSeleccionado.id,
      fecha: new Date(),
      peso: parseFloat(this.paciente.peso),
      altura: parseFloat(this.paciente.altura),
      actividad: this.paciente.actividad as any,
      objetivo: this.paciente.objetivo as any,
      calorias: this.pautaNutricional.calorias,
      proteinas: this.pautaNutricional.proteinas,
      carbohidratos: this.pautaNutricional.carbohidratos,
      grasas: this.pautaNutricional.grasas,
      recomendaciones: this.pautaNutricional.recomendaciones,
      createdWith: this.isAIEnabled ? 'con-ia' : 'sin-ia'
    });

    // Guardar pauta nutricional
    const menuSugerido = this.isAIEnabled ? this.generarMenuIA() : this.generarMenuBasico();
    this.dataService.addPauta({
      pacienteId: this.pacienteSeleccionado.id,
      fecha: new Date(),
      calorias: this.pautaNutricional.calorias,
      proteinas: this.pautaNutricional.proteinas,
      carbohidratos: this.pautaNutricional.carbohidratos,
      grasas: this.pautaNutricional.grasas,
      recomendaciones: this.pautaNutricional.recomendaciones,
      menu: menuSugerido,
      createdWith: this.isAIEnabled ? 'con-ia' : 'sin-ia',
      basadoEnHistorial: this.dataService.getRegistrosByPaciente(this.pacienteSeleccionado.id).length > 0
    });

    alert('✅ Pauta nutricional guardada exitosamente');
    
    // Navegar al seguimiento del paciente
    this.router.navigate(['/seguimiento'], { 
      queryParams: { pacienteId: this.pacienteSeleccionado.id } 
    });
  }

  generarRecomendacionesBasicas(): string {
    return `
      - Realizar 3 comidas principales y 2 colaciones
      - Incluir proteínas en cada comida
      - Consumir al menos 5 porciones de frutas y verduras al día
      - Beber 8 vasos de agua diarios
      - Evitar alimentos ultraprocesados
    `;
  }

  generarRecomendacionesIA(): string {
    if (!this.pacienteSeleccionado) return this.generarRecomendacionesBasicas();
    
    return this.dataService.generarSugerenciaIA(this.pacienteSeleccionado.id);
  }

  generarMenuBasico(): string[] {
    return [
      'Desayuno: Avena con frutas y frutos secos',
      'Media mañana: Yogur natural con almendras',
      'Almuerzo: Pollo grillado con ensalada mixta',
      'Once: Té con tostadas integrales',
      'Cena: Pescado al horno con verduras'
    ];
  }

  generarMenuIA(): string[] {
    // Menú más personalizado según objetivo
    if (this.paciente.objetivo === 'perder') {
      return [
        'Desayuno: Huevos revueltos con espinacas (bajo en carbohidratos)',
        'Media mañana: Yogur griego con berries',
        'Almuerzo: Salmón con quinoa y brócoli al vapor',
        'Once: Té verde con almendras (5 unidades)',
        'Cena: Pechuga de pollo con ensalada mediterránea'
      ];
    } else if (this.paciente.objetivo === 'ganar') {
      return [
        'Desayuno: Avena con plátano, miel y nueces',
        'Media mañana: Batido de proteínas con frutas',
        'Almuerzo: Arroz integral con pollo y palta',
        'Once: Pan integral con palta y huevo',
        'Cena: Pasta integral con salmón y verduras'
      ];
    } else {
      return [
        'Desayuno: Tostadas integrales con palta y tomate',
        'Media mañana: Fruta de estación con yogur',
        'Almuerzo: Ensalada completa con proteína magra',
        'Once: Té con galletas integrales',
        'Cena: Pescado con arroz y verduras salteadas'
      ];
    }
  }

  simularAnalisisIA() {
    if (!this.pacienteSeleccionado) {
      alert('Primero debe seleccionar un paciente');
      return;
    }
    
    // Simulación de análisis con IA
    const sugerencia = this.dataService.generarSugerenciaIA(this.pacienteSeleccionado.id);
    alert('🤖 ANÁLISIS COMPLETO CON IA:\n\n' + sugerencia);
  }

  verHistorialPaciente() {
    if (this.pacienteSeleccionado) {
      this.router.navigate(['/seguimiento'], { 
        queryParams: { pacienteId: this.pacienteSeleccionado.id } 
      });
    }
  }
}
