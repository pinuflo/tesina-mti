import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { WorkflowAccion, WorkflowLogEntry, VersionMode } from '../models/nutricion.models';

interface CompletePayload {
  facilidad?: number;
  comentario?: string;
  camposAutocompletados?: number;
  camposManuales?: number;
  tiempoMinutos?: number;
  interacciones?: number;
  iaSugerencias?: number;
  iaAceptadas?: number;
  iaCorregidas?: number;
}

@Injectable({
  providedIn: 'root'
})
export class WorkflowLogService {
  private readonly STORAGE_KEY = 'workflow_logs';
  private logsSubject = new BehaviorSubject<WorkflowLogEntry[]>([]);
  public logs$ = this.logsSubject.asObservable();

  constructor() {
    this.loadFromStorage();
  }

  startStep(pacienteId: string, flujoId: string, pasoId: string, modo: VersionMode): WorkflowLogEntry {
    const log: WorkflowLogEntry = {
      id: this.generateId(),
      pacienteId,
      flujoId,
      pasoId,
      modo,
      inicio: new Date().toISOString(),
      acciones: []
    };
    const logs = [...this.logsSubject.value, log];
    this.setLogs(logs);
    return log;
  }

  addAccion(logId: string, accion: Omit<WorkflowAccion, 'timestamp'> & { timestamp?: string }): void {
    const logs = this.logsSubject.value.map(log => {
      if (log.id !== logId) {
        return log;
      }
      const timestamp = accion.timestamp || new Date().toISOString();
      return {
        ...log,
        acciones: [...log.acciones, { ...accion, timestamp }]
      };
    });
    this.setLogs(logs);
  }

  completeStep(logId: string, payload: CompletePayload = {}): void {
    const logs = this.logsSubject.value.map(log => {
      if (log.id !== logId) {
        return log;
      }
      const fin = new Date().toISOString();
      const inicioDate = new Date(log.inicio);
      const finDate = new Date(fin);
      const diffMin = payload.tiempoMinutos ?? Math.max(0, (finDate.getTime() - inicioDate.getTime()) / 60000);
      return {
        ...log,
        fin,
        facilidad: payload.facilidad ?? log.facilidad,
        comentario: payload.comentario ?? log.comentario,
        camposAutocompletados: payload.camposAutocompletados ?? log.camposAutocompletados,
        camposManuales: payload.camposManuales ?? log.camposManuales,
        interacciones: payload.interacciones ?? log.interacciones,
        iaSugerencias: payload.iaSugerencias ?? log.iaSugerencias,
        iaAceptadas: payload.iaAceptadas ?? log.iaAceptadas,
        iaCorregidas: payload.iaCorregidas ?? log.iaCorregidas,
        acciones: log.acciones,
        tiempoMinutos: diffMin
      } as WorkflowLogEntry;
    });
    this.setLogs(logs);
  }

  getLogsByPaciente(pacienteId: string): WorkflowLogEntry[] {
    return this.logsSubject.value.filter(log => log.pacienteId === pacienteId);
  }

  getLogsByFlujo(flujoId: string): WorkflowLogEntry[] {
    return this.logsSubject.value.filter(log => log.flujoId === flujoId);
  }

  getLogsByPaso(pacienteId: string, pasoId: string): WorkflowLogEntry[] {
    return this.logsSubject.value.filter(log => log.pacienteId === pacienteId && log.pasoId === pasoId);
  }

  private setLogs(logs: WorkflowLogEntry[]) {
    this.logsSubject.next(logs);
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(logs));
    } catch (error) {
      console.error('Error saving workflow logs', error);
    }
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        this.logsSubject.next(JSON.parse(raw));
      }
    } catch (error) {
      console.error('Error loading workflow logs', error);
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  }
}
