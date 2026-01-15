import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DataService } from '../services/data.service';
import { VersionService } from '../services/version.service';
import { Paciente, RegistroNutricional, SeguimientoMensual, PautaNutricional } from '../models/nutricion.models';

@Component({
  selector: 'app-seguimiento',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './seguimiento.component.html',
  styleUrl: './seguimiento.component.scss'
})
export class SeguimientoComponent implements OnInit {
  isAIEnabled = false;
  pacienteSeleccionado: Paciente | null = null;
  pacientes: Paciente[] = [];
  registros: RegistroNutricional[] = [];
  seguimientos: SeguimientoMensual[] = [];
  pautas: PautaNutricional[] = [];
  
  constructor(
    private dataService: DataService,
    private versionService: VersionService,
    private route: ActivatedRoute
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

  seleccionarPaciente(paciente: Paciente | string) {
    const pac = typeof paciente === 'string' 
      ? this.dataService.getPacienteById(paciente) 
      : paciente;
    
    if (pac) {
      this.pacienteSeleccionado = pac;
      this.cargarHistorial();
    }
  }

  cargarHistorial() {
    if (!this.pacienteSeleccionado) return;
    
    this.registros = this.dataService.getRegistrosByPaciente(this.pacienteSeleccionado.id);
    this.seguimientos = this.dataService.getSeguimientosByPaciente(this.pacienteSeleccionado.id);
    this.pautas = this.dataService.getPautasByPaciente(this.pacienteSeleccionado.id);
  }

  getEvolucionPeso(): { fechas: string[], pesos: number[] } {
    const fechas = this.registros.map(r => new Date(r.fecha).toLocaleDateString()).reverse();
    const pesos = this.registros.map(r => r.peso).reverse();
    return { fechas, pesos };
  }

  getPromedioSatisfaccion(): number {
    if (this.seguimientos.length === 0) return 0;
    return this.seguimientos.reduce((sum, s) => sum + s.satisfaccion, 0) / this.seguimientos.length;
  }

  getPromedioCumplimiento(): number {
    if (this.seguimientos.length === 0) return 0;
    const promedioDieta = this.seguimientos.reduce((sum, s) => sum + s.cumplimientoDieta, 0) / this.seguimientos.length;
    const promedioEjercicio = this.seguimientos.reduce((sum, s) => sum + s.cumplimientoEjercicio, 0) / this.seguimientos.length;
    return (promedioDieta + promedioEjercicio) / 2;
  }

  generarSugerenciaIA() {
    if (!this.pacienteSeleccionado || !this.isAIEnabled) return;
    
    const sugerencia = this.dataService.generarSugerenciaIA(this.pacienteSeleccionado.id);
    alert('🤖 SUGERENCIA PERSONALIZADA BASADA EN HISTORIAL:\n\n' + sugerencia);
  }

  agregarSeguimiento() {
    if (!this.pacienteSeleccionado) return;
    
    const ahora = new Date();
    const pesoActual = this.registros.length > 0 ? this.registros[0].peso : 70;
    
    const seguimiento: Omit<SeguimientoMensual, 'id'> = {
      pacienteId: this.pacienteSeleccionado.id,
      mes: ahora.getMonth() + 1,
      año: ahora.getFullYear(),
      pesoInicial: pesoActual,
      pesoFinal: pesoActual + (Math.random() * 2 - 1), // Simulación
      cumplimientoDieta: 70 + Math.floor(Math.random() * 30),
      cumplimientoEjercicio: 60 + Math.floor(Math.random() * 40),
      satisfaccion: 3 + Math.floor(Math.random() * 3),
      observaciones: 'Seguimiento registrado automáticamente',
      fecha: ahora
    };
    
    this.dataService.addSeguimiento(seguimiento);
    this.cargarHistorial();
    alert('✅ Seguimiento agregado exitosamente');
  }
}
