import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { FlujoObjetivoFinal, FlujoTrabajo, PasoFlujo, VersionMode } from '../models/nutricion.models';
import { WorkflowService } from '../services/workflow.service';

type FlowFilter = VersionMode | 'comparativo' | 'todos';

@Component({
  selector: 'app-flow-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './flow-catalog.component.html',
  styleUrl: './flow-catalog.component.scss'
})
export class FlowCatalogComponent implements OnInit, OnDestroy {
  flujos: FlujoTrabajo[] = [];
  filteredFlujos: FlujoTrabajo[] = [];
  draftFlujo: FlujoTrabajo | null = null;
  selectedFlujoId: string | null = null;
  objetivosInput = '';
  menuObjetivoInput = '';
  stepDraft: PasoFlujo = this.buildEmptyStep('sin-ia');
  nuevoPasoChecklist = '';
  nuevoPasoAcciones = '';
  formErrors: string[] = [];
  successMessage = '';
  isCreating = false;
  filterMode: FlowFilter = 'todos';
  checklistBuffers: Record<string, string> = {};
  accionesBuffers: Record<string, string> = {};
  private subscription?: Subscription;

  constructor(private workflowService: WorkflowService) {}

  ngOnInit(): void {
    this.subscription = this.workflowService.flujos$.subscribe(flujos => {
      this.flujos = flujos;
      this.applyFilter();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  onFilterChange(mode: FlowFilter): void {
    this.filterMode = mode;
    this.applyFilter();
  }

  startNewFlow(mode: VersionMode | 'comparativo' = 'sin-ia'): void {
    const nuevo: FlujoTrabajo = {
      id: '',
      nombre: mode === 'con-ia' ? 'Nuevo Protocolo Asistido' : 'Nuevo Protocolo Manual',
      descripcion: 'Describe el objetivo general del flujo.',
      modoObjetivo: mode,
      pasos: [],
      tiempoEstimadoMin: mode === 'con-ia' ? 60 : 90,
      objetivos: [],
      activo: true,
      objetivoFinal: this.buildEmptyObjetivoFinal()
    };

    this.isCreating = true;
    this.draftFlujo = nuevo;
    this.selectedFlujoId = null;
    this.objetivosInput = '';
    this.menuObjetivoInput = '';
    this.stepDraft = this.buildEmptyStep(mode === 'con-ia' ? 'con-ia' : 'sin-ia');
    this.nuevoPasoChecklist = '';
    this.nuevoPasoAcciones = '';
    this.checklistBuffers = {};
    this.accionesBuffers = {};
    this.formErrors = [];
    this.successMessage = '';
  }

  selectFlujo(flujo: FlujoTrabajo): void {
    this.isCreating = false;
    this.draftFlujo = this.cloneFlujo(flujo);
    this.selectedFlujoId = flujo.id;
    this.objetivosInput = (this.draftFlujo.objetivos ?? []).join('\n');
    this.menuObjetivoInput = this.draftFlujo.objetivoFinal?.menuSugerido?.join('\n') ?? '';
    this.stepDraft = this.buildEmptyStep(this.getDefaultStepMode());
    this.syncStepBuffers();
    this.formErrors = [];
    this.successMessage = '';
  }

  addStep(): void {
    if (!this.draftFlujo || !this.stepDraft.titulo.trim()) {
      this.formErrors = ['Completa el título del paso antes de añadirlo.'];
      return;
    }

    const nuevoPaso: PasoFlujo = {
      ...this.stepDraft,
      id: this.generateTempId(),
      orden: (this.draftFlujo.pasos.length ?? 0) + 1,
      checklist: this.splitLines(this.nuevoPasoChecklist),
      accionesIA: this.stepDraft.requiereIA ? this.splitLines(this.nuevoPasoAcciones) : []
    };

    this.draftFlujo = {
      ...this.draftFlujo,
      pasos: [...this.draftFlujo.pasos, nuevoPaso]
    };

    this.checklistBuffers[nuevoPaso.id] = this.nuevoPasoChecklist;
    this.accionesBuffers[nuevoPaso.id] = this.nuevoPasoAcciones;
    this.resetStepDraft();
    this.formErrors = [];
  }

  removeStep(pasoId: string): void {
    if (!this.draftFlujo) {
      return;
    }
    this.draftFlujo = {
      ...this.draftFlujo,
      pasos: this.draftFlujo.pasos
        .filter(paso => paso.id !== pasoId)
        .map((paso, index) => ({ ...paso, orden: index + 1 }))
    };
    delete this.checklistBuffers[pasoId];
    delete this.accionesBuffers[pasoId];
  }

  moveStep(pasoId: string, direction: 'up' | 'down'): void {
    if (!this.draftFlujo) {
      return;
    }
    const pasos = [...this.draftFlujo.pasos].sort((a, b) => a.orden - b.orden);
    const index = pasos.findIndex(p => p.id === pasoId);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || target < 0 || target >= pasos.length) {
      return;
    }
    [pasos[index], pasos[target]] = [pasos[target], pasos[index]];
    const reordenados = pasos.map((paso, idx) => ({ ...paso, orden: idx + 1 }));
    this.draftFlujo = { ...this.draftFlujo, pasos: reordenados };
  }

  updateChecklist(pasoId: string, value: string): void {
    if (!this.draftFlujo) {
      return;
    }
    this.checklistBuffers[pasoId] = value;
    this.draftFlujo = {
      ...this.draftFlujo,
      pasos: this.draftFlujo.pasos.map(paso =>
        paso.id === pasoId ? { ...paso, checklist: this.splitLines(value) } : paso
      )
    };
  }

  updateAcciones(pasoId: string, value: string): void {
    if (!this.draftFlujo) {
      return;
    }
    this.accionesBuffers[pasoId] = value;
    this.draftFlujo = {
      ...this.draftFlujo,
      pasos: this.draftFlujo.pasos.map(paso =>
        paso.id === pasoId ? { ...paso, accionesIA: this.splitLines(value) } : paso
      )
    };
  }

  guardarFlujo(): void {
    if (!this.draftFlujo) {
      return;
    }
    const errores = this.validateDraft();
    if (errores.length) {
      this.formErrors = errores;
      this.successMessage = '';
      return;
    }

    const payload: FlujoTrabajo = {
      ...this.draftFlujo,
      objetivos: this.splitLines(this.objetivosInput),
      pasos: this.draftFlujoPasosNormalizados(),
      objetivoFinal: this.buildObjetivoFinalDesdeForm()
    };

    const saved = this.workflowService.saveFlujo(payload);
    this.formErrors = [];
    this.successMessage = 'Plantilla guardada correctamente.';
    this.selectFlujo(saved);
    this.applyFilter();
  }

  eliminarFlujo(): void {
    if (!this.draftFlujo || !this.draftFlujo.id) {
      return;
    }
    if (!this.confirmDelete()) {
      return;
    }
    const eliminado = this.workflowService.deleteFlujo(this.draftFlujo.id);
    if (!eliminado) {
      this.formErrors = ['No se puede eliminar la plantilla porque está asociada a flujos existentes.'];
      return;
    }
    this.clearDraft();
    this.applyFilter();
  }

  duplicarFlujo(): void {
    if (!this.draftFlujo || !this.draftFlujo.id) {
      return;
    }
    const copia = this.workflowService.duplicateFlujo(this.draftFlujo.id);
    if (copia) {
      this.selectFlujo(copia);
      this.successMessage = 'Se generó una copia inactiva lista para ajustes.';
    }
  }

  cancelarEdicion(): void {
    this.clearDraft();
  }

  private applyFilter(): void {
    this.filteredFlujos = this.filterMode === 'todos'
      ? this.flujos
      : this.flujos.filter(f => f.modoObjetivo === this.filterMode);
  }

  private splitLines(value: string): string[] {
    return value
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  private cloneFlujo(flujo: FlujoTrabajo): FlujoTrabajo {
    return {
      ...flujo,
      objetivos: [...(flujo.objetivos ?? [])],
      pasos: flujo.pasos.map(paso => ({
        ...paso,
        checklist: [...(paso.checklist ?? [])],
        accionesIA: [...(paso.accionesIA ?? [])]
      })),
      objetivoFinal: flujo.objetivoFinal
        ? {
            ...flujo.objetivoFinal,
            menuSugerido: [...(flujo.objetivoFinal.menuSugerido ?? [])]
          }
        : this.buildEmptyObjetivoFinal()
    };
  }

  private buildEmptyObjetivoFinal(): FlujoObjetivoFinal {
    return {
      descripcion: '',
      caloriasObjetivo: 0,
      proteinasObjetivo: 0,
      carbohidratosObjetivo: 0,
      grasasObjetivo: 0,
      menuSugerido: []
    };
  }

  private buildEmptyStep(modo: PasoFlujo['modo']): PasoFlujo {
    return {
      id: '',
      titulo: '',
      descripcion: '',
      modulo: 'pacientes',
      orden: (this.draftFlujo?.pasos.length ?? 0) + 1,
      modo,
      requiereIA: modo === 'con-ia',
      checklist: [],
      accionesIA: [],
      estimacionMinutos: modo === 'con-ia' ? 15 : 25
    };
  }

  private resetStepDraft(): void {
    this.stepDraft = this.buildEmptyStep(this.getDefaultStepMode());
    this.nuevoPasoChecklist = '';
    this.nuevoPasoAcciones = '';
  }

  private getDefaultStepMode(): PasoFlujo['modo'] {
    if (!this.draftFlujo) {
      return 'sin-ia';
    }
    if (this.draftFlujo.modoObjetivo === 'comparativo') {
      return 'mixto';
    }
    return this.draftFlujo.modoObjetivo as PasoFlujo['modo'];
  }

  private syncStepBuffers(): void {
    if (!this.draftFlujo) {
      this.checklistBuffers = {};
      this.accionesBuffers = {};
      return;
    }
    const checklist: Record<string, string> = {};
    const acciones: Record<string, string> = {};
    this.draftFlujo.pasos.forEach(paso => {
      checklist[paso.id] = (paso.checklist ?? []).join('\n');
      acciones[paso.id] = (paso.accionesIA ?? []).join('\n');
    });
    this.checklistBuffers = checklist;
    this.accionesBuffers = acciones;
  }

  private validateDraft(): string[] {
    if (!this.draftFlujo) {
      return ['Selecciona o crea una plantilla para comenzar.'];
    }
    const errores: string[] = [];
    if (!this.draftFlujo.nombre.trim()) {
      errores.push('La plantilla necesita un nombre.');
    }
    if (!this.draftFlujo.descripcion.trim()) {
      errores.push('Incluye una descripción para contextualizar el flujo.');
    }
    if (this.draftFlujo.pasos.length === 0) {
      errores.push('Agrega al menos un paso para guardar la plantilla.');
    }
    return errores;
  }

  private draftFlujoPasosNormalizados(): PasoFlujo[] {
    if (!this.draftFlujo) {
      return [];
    }
    return this.draftFlujo.pasos.map((paso, index) => ({
      ...paso,
      orden: index + 1,
      checklist: this.splitLines(this.checklistBuffers[paso.id] ?? (paso.checklist ?? []).join('\n')),
      accionesIA: paso.requiereIA ? this.splitLines(this.accionesBuffers[paso.id] ?? (paso.accionesIA ?? []).join('\n')) : []
    }));
  }

  private buildObjetivoFinalDesdeForm(): FlujoObjetivoFinal | undefined {
    if (!this.draftFlujo) {
      return undefined;
    }
    return {
      ...(this.draftFlujo.objetivoFinal ?? this.buildEmptyObjetivoFinal()),
      menuSugerido: this.splitLines(this.menuObjetivoInput)
    };
  }

  private confirmDelete(): boolean {
    if (!this.draftFlujo?.nombre) {
      return false;
    }
    return confirm(`¿Eliminar "${this.draftFlujo.nombre}"? Esta acción no se puede deshacer.`);
  }

  private clearDraft(): void {
    this.draftFlujo = null;
    this.selectedFlujoId = null;
    this.objetivosInput = '';
    this.menuObjetivoInput = '';
    this.formErrors = [];
    this.successMessage = '';
    this.stepDraft = this.buildEmptyStep('sin-ia');
    this.checklistBuffers = {};
    this.accionesBuffers = {};
  }

  private generateTempId(): string {
    return 'tmp_' + Math.random().toString(36).substring(2, 8);
  }
}
