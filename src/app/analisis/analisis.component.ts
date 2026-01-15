import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../services/data.service';
import { VersionService } from '../services/version.service';
import { Paciente, RegistroNutricional } from '../models/nutricion.models';

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
  estadisticas = {
    totalPacientes: 0,
    pacientesActivos: 0,
    totalConsultas: 0,
    consultasConIA: 0,
    consultasSinIA: 0,
    promedioIMC: 0
  };

  constructor(
    private dataService: DataService,
    private versionService: VersionService
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
}
